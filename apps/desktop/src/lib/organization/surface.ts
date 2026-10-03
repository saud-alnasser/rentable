import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { defineSurface } from '$lib/feature/surface';
import { RECORD_PARAM, withSection } from '$lib/settings';
import { workspacePageOf } from './workspace/address';
import dialogs from './component/dialogs.svelte';
import host from './component/host.svelte';
import railRow from './component/rail-row.svelte';
import { useOrganizationOfferings } from './palette';
import { useFetchOrganizationState } from './query';
import SettingsAccount from './component/settings-account.svelte';
import SettingsOrganization, {
	loadOrganizationSettings
} from './component/settings-organization.svelte';
import SettingsWorkspaces from './component/settings-workspaces.svelte';

/**
 * The organization's host, its members and workspaces in the command menu, and the three sections
 * it contributes to the settings area.
 *
 * **A member and a workspace are found only while one of their acts asks for one.** They are
 * opened from their settings directory, and the menu reaches them to run an act on them; their
 * acts are gated on who is reading, so the organization reads what they are gated on and offers
 * only the acts that reader may take (`palette.ts`). Opening a member goes to its card in the
 * settings area, and a workspace to its own page.
 *
 * **The settings sections follow the area's own general section**, each drawn under the name
 * `settings/section.ts` gives it in the address, in this order, and only while somebody is signed
 * in, which the area decides: each needs an organization to show anything. What the three read is
 * started as the settings page mounts, by the organization section's `load`.
 *
 * **The account's row at the foot of the rail and the dialogs beside the frame are slots** the
 * shell draws at its own places, so the shell names no organization component: making an account,
 * creating a workspace and the link an account's act produces are drawn beside the frame by
 * `component/dialogs.svelte`, and who is signed in by `component/rail-row.svelte`.
 *
 * **The workspace reads the session through what the organization contributes to it**: its row at
 * the top of the rail and its permissions in the frame read who is signed in and who holds what,
 * and the organization depends on the workspace rather than the other way round.
 */
export default defineSurface({
	name: 'organization',
	host,
	search: [
		{
			subject: 'member',
			heading: (t) => t.organization.dashboard.membersTitle(),
			href: (match) =>
				`${resolve(withSection('organization'))}&${RECORD_PARAM}=${encodeURIComponent(match.id)}` as ResolvedPathname,
			find: (term, asked, { isOpen }) => useOrganizationOfferings(isOpen).member.find(term, asked)
		},
		{
			subject: 'workspace',
			heading: (t) => t.settings.section.workspaces(),
			href: (match) => workspacePageOf(match.id),
			find: (term, asked, { isOpen }) =>
				useOrganizationOfferings(isOpen).workspace.find(term, asked)
		}
	],
	acts: [
		{ subject: 'member', use: (isOpen) => useOrganizationOfferings(isOpen).member },
		{ subject: 'workspace', use: (isOpen) => useOrganizationOfferings(isOpen).workspace }
	],
	sections: [
		{
			on: 'settings',
			order: 10,
			value: 'account',
			label: (t) => t.settings.section.account(),
			component: SettingsAccount
		},
		{
			on: 'settings',
			order: 20,
			value: 'organization',
			label: (t) => t.settings.section.organization(),
			component: SettingsOrganization,
			load: loadOrganizationSettings
		},
		{
			on: 'settings',
			order: 30,
			value: 'workspaces',
			label: (t) => t.settings.section.workspaces(),
			component: SettingsWorkspaces
		}
	],
	slots: [
		{ slot: 'account-menu', component: railRow },
		{ slot: 'dialogs', component: dialogs }
	],
	contributes: {
		workspace: {
			useOrganizationState: () => useFetchOrganizationState()
		}
	}
});
