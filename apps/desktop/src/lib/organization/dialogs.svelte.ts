import type { Invited } from '$lib/platform/tauri';

/**
 * THE TWO ORGANIZATION DIALOGS, ASKED FOR IN ONE PLACE AND DRAWN IN ANOTHER
 *
 * Inviting a member and creating a workspace are each one form on the shared form surface,
 * mounted once in the shell by `layout/component/organization-dialogs.svelte`, and opened from
 * two places that share no parent: the rail's workspace menu and the organization page. So what
 * they share is this, module-level rune state the way `layout/startup-stage.svelte.ts` is, and a
 * request raised here and answered there, the way `sync/sign-out.ts` is.
 *
 * **One host and not one per caller.** With an instance each, an invitation made from the menu
 * would show its link in a panel the page's instance has never seen, and a person who went to the
 * page to find it would find an empty form. One instance is one result panel, and `invited` sits
 * here rather than in the host for the same reason: a reset made from the members list on the
 * page is answered with a link the same way, and shown in the same panel.
 */

export type OrganizationDialogKind = 'invite' | 'workspace';

/**
 * the one thing an invitation hands over, with its copy control in the result panel. *Three,
 * the link, the username and a generated password, until effort 826 put the secret inside the
 * link.*
 */
export type InvitedCopy = 'link';

export const organizationDialog = $state<{
	/** which of the two is open, or neither. */
	open: OrganizationDialogKind | null;
	/**
	 * what the last invitation or reset made, shown in the invite dialog until dismissed. Closing
	 * the dialog keeps it, since a closed sheet is not a dismissal; the panel's own done control
	 * is.
	 */
	invited: Invited | null;
}>({ open: null, invited: null });

export function openOrganizationDialog(kind: OrganizationDialogKind) {
	organizationDialog.open = kind;
}

export function closeOrganizationDialog() {
	organizationDialog.open = null;
}

/** an invitation or a reset was made: open the invite dialog on what it made. */
export function showInvited(invited: Invited) {
	organizationDialog.invited = invited;
	organizationDialog.open = 'invite';
}

/** the person has taken the link: the panel goes, and the dialog with it. */
export function dismissInvited() {
	organizationDialog.invited = null;
	organizationDialog.open = null;
}

/** nobody is signed in any more: nothing here outlives the session that made it. */
export function resetOrganizationDialogs() {
	organizationDialog.open = null;
	organizationDialog.invited = null;
}
