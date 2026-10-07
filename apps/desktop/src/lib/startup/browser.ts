import api, { forgetContext } from '$lib/api/caller';
import { invalidateRoot } from '$lib/mutation';
import { toErrorMessage, toErrorText } from '$lib/error/message';
import LL from '$lib/i18n/i18n-svelte';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { baseLocale, locales } from '$lib/i18n/i18n-util';
import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
import type { Locales } from '$lib/i18n/i18n-types';
import { browserAppearance } from '$lib/platform/appearance';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { tauri } from '$lib/platform/tauri';
import { forgetEveryChange } from '$lib/undo';
import { updater } from '$lib/update/ui';
import { organizationKeys } from '$lib/organization/ui';
import { announceReceivedRows, syncWorkspaceBeforeExit, syncWorkspaceNow } from '$lib/sync';
import { syncKeys } from '$lib/sync/ui';
import type { OrganizationHost } from '$lib/organization';
import type { SettingsHost } from '$lib/settings';
import type { SyncHost } from '$lib/sync';
import type { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

import { reportStartupComplete, reportStartupStage } from './stage.svelte';
import type { StartupPorts } from './ports';

/**
 * What `./startup` reaches for, wired to the machine it actually runs on.
 *
 * Separate from the unit so that the unit names what it needs and this names where each one comes
 * from, and separate from the route so the route holds neither. A test supplies its own set; this
 * is the only place the real ones are assembled.
 *
 * Everything here is a one-line forward. Anything with a decision in it belongs in the unit, where
 * a test can reach it.
 *
 * **The organization's, settings' and sync's ports are handed in** by the root layout, off the host
 * the composition root composes (`$lib/app/host`), since each is a feature's and the shell reaches
 * no feature's adapter.
 */
export function browserStartupPorts(
	queryClient: QueryClient,
	{
		organization,
		settings,
		sync
	}: { organization: OrganizationHost; settings: SettingsHost; sync: SyncHost }
): StartupPorts {
	return {
		window: {
			show: () => tauri.window.show(),
			hide: () => tauri.window.hide(),
			close: () => tauri.window.close()
		},
		settings: { get: () => settings.get() },
		// made here, while the ports are assembled, so it follows the system from before anything
		// is shown; startup then applies what the reader chose.
		appearance: (() => {
			const appearance = browserAppearance();

			return { apply: (setting) => appearance.apply(setting) };
		})(),
		sync: {
			getState: () => sync.getState()
		},
		organization: {
			getState: () => organization.getState(),
			signIn: (username, password) => organization.signIn(username, password),
			signOut: () => organization.signOut(),
			select: (organizationId) => organization.select(organizationId),
			remove: (organizationId) => organization.remove(organizationId),
			openWorkspace: (workspaceId) => organization.workspace.open(workspaceId),
			renewDue: () => organization.renewDue()
		},
		workspace: {
			bootstrap: () => api.startup.bootstrap(),
			reconcile: () => api.contract.reconcile(),
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
			rememberRemoteSync: (state) => queryClient.setQueryData(syncKeys.remoteSync, state),
			invalidateRemoteSync: () => queryClient.invalidateQueries({ queryKey: syncKeys.remoteSync }),
			invalidateAll: () => invalidateRoot(queryClient),
			invalidateOrganization: () =>
				queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
			forgetContext
		},
		undo: { forget: forgetEveryChange },
		// the update looks once a run, downloads in the background and offers the restart itself.
		update: { lookAtLaunch: () => void updater.lookAtLaunch() },
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
