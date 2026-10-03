import { resolve } from '$app/paths';
import { RECORD_PARAM, withSection } from '$lib/settings';

/**
 * WHERE A WORKSPACE IS READ
 *
 * A workspace has a page of its own (effort 846, ticket 49), under the settings area it is listed
 * in: `/settings/workspaces/<id>`. The settings area itself stays one pathname with its sections in
 * the address (`settings/section.ts`), so the page is a path beneath it rather than a section, and
 * the workspaces section is where it is listed and where back returns to.
 */

/** a workspace's page, resolved. */
export const workspacePageOf = (workspaceId: string) =>
	resolve(`/settings/workspaces/${encodeURIComponent(workspaceId)}`);

/** the settings area's workspaces section, resolved: where a workspace's page is listed. */
export const workspacesSection = () => resolve(withSection('workspaces'));

/**
 * one member on a workspace's page, resolved: the page with the member named on it, which their
 * card's press is and the page consumes by opening what they may do there (ticket 51), the way the
 * organization section consumes a member named on its own address.
 */
export const holderCardOf = (workspaceId: string, memberId: string) =>
	`${workspacePageOf(workspaceId)}?${RECORD_PARAM}=${encodeURIComponent(memberId)}`;
