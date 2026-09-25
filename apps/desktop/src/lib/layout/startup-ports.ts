import api, { forgetContext } from '$lib/api/caller';
import { invalidateRoot } from '$lib/design/query';
import { toErrorMessage, toErrorText } from '$lib/error/message';
import LL from '$lib/i18n/i18n-svelte';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { baseLocale, locales } from '$lib/i18n/i18n-util';
import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
import type { Locales } from '$lib/i18n/i18n-types';
import { browserAppearance } from '$lib/platform/appearance';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { tauri } from '$lib/platform/tauri';
import { keys as organizationKeys } from '$lib/organization/query';
import { keys as settingsKeys } from '$lib/settings/query';
import {
	announceReceivedRows,
	syncWorkspaceBeforeExit,
	syncWorkspaceNow
} from '$lib/sync/workspace';
import type { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

import { reportStartupComplete, reportStartupStage } from './startup-stage.svelte';
import type { StartupPorts } from './startup';

/**
 * What `./startup` reaches for, wired to the machine it actually runs on.
 *
 * Separate from the unit so that the unit names what it needs and this names where each one comes
 * from, and separate from the route so the route holds neither. A test supplies its own set; this
 * is the only place the real ones are assembled.
 *
 * Everything here is a one-line forward. Anything with a decision in it belongs in the unit, where
 * a test can reach it.
 */
export function browserStartupPorts(queryClient: QueryClient): StartupPorts {
	return {
		window: {
			show: () => tauri.window.show(),
			hide: () => tauri.window.hide(),
			close: () => tauri.window.close()
		},
		settings: { get: () => tauri.settings.get() },
		// made here, while the ports are assembled, so it follows the system from before anything
		// is shown; startup then applies what the reader chose.
		appearance: (() => {
			const appearance = browserAppearance();

			return { apply: (setting) => appearance.apply(setting) };
		})(),
		remoteSync: {
			getState: () => tauri.remoteSync.getState()
		},
		organization: {
			getState: () => tauri.organization.getState(),
			signIn: (username, password) => tauri.organization.signIn(username, password),
			signOut: () => tauri.organization.signOut(),
			disconnect: () => tauri.organization.disconnect(),
			openWorkspace: (workspaceId) => tauri.organization.workspace.open(workspaceId),
			renewDue: () => tauri.organization.renewDue()
		},
		workspace: {
			bootstrap: () => api.app.bootstrap(),
			reconcile: () => api.app.state.reconcile(),
			syncNow: (state) => syncWorkspaceNow(state),
			syncBeforeExit: (state) => syncWorkspaceBeforeExit(state),
			announceReceived: () => announceReceivedRows(queryClient)
		},
		locale: {
			load: (locale) => loadLocaleAsync(locale as Locales),
			set: (locale) => setLocale(locale as Locales),
			all: locales,
			base: baseLocale
		},
		cache: {
			clear: () => queryClient.clear(),
			dropUndrawn: () => queryClient.removeQueries({ type: 'inactive' }),
			rememberRemoteSync: (state) => queryClient.setQueryData(settingsKeys.remoteSync, state),
			invalidateRemoteSync: () =>
				queryClient.invalidateQueries({ queryKey: settingsKeys.remoteSync }),
			invalidateAll: () => invalidateRoot(queryClient),
			invalidateOrganization: () =>
				queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
			forgetContext
		},
		// read at the moment of the failure rather than captured, so it is written in whatever
		// language the reader had by then.
		// the sentence alone: the shell's own words are the detail, drawn behind a disclosure where
		// the surface has room and written to diagnostics on a failed start.
		describeError: (error) =>
			toErrorText(error, get(LL), get(LL).layout.startup.failedToStartFallback()),
		detailError: (error) => toErrorMessage(error, get(LL)).detail,
		recordFailure: (message, detail) =>
			recordDiagnosticError('startup.failed', { error: message, detail }),
		reportStage: reportStartupStage,
		reportComplete: reportStartupComplete,
		now: () => Date.now()
	};
}
