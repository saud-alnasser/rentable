import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { defineSurface } from '$lib/feature/surface';
import { RECORD_PARAM, WORKSPACE_PARAM, withSection } from '$lib/settings/section';
import host from './component/host.svelte';
import { useOrganizationOfferings } from './palette';

/**
 * The organization's host, and its members and workspaces in the command menu.
 *
 * **A member and a workspace are found only while one of their acts asks for one.** They are
 * opened from their settings directory, and the menu reaches them to run an act on them; their
 * acts are gated on who is reading, so the organization reads what they are gated on and offers
 * only the acts that reader may take (`palette.ts`). Opening one goes to its card in the settings
 * area.
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
			href: (match) =>
				`${resolve(withSection('workspaces'))}&${WORKSPACE_PARAM}=${encodeURIComponent(match.id)}` as ResolvedPathname,
			find: (term, asked, { isOpen }) =>
				useOrganizationOfferings(isOpen).workspace.find(term, asked)
		}
	],
	acts: [
		{ subject: 'member', use: (isOpen) => useOrganizationOfferings(isOpen).member },
		{ subject: 'workspace', use: (isOpen) => useOrganizationOfferings(isOpen).workspace }
	]
});
