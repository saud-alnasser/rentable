/**
 * what an invitation hands over, whichever act produced it: the link, whom it is for, the code
 * that opens it and the date the pair lapses.
 *
 * **Narrower than `Invited` on purpose.** An invite and a reset answer with a whole `Invited`;
 * copying the link again answers with the link and the code, and the row beside it is where the
 * username and the expiry come from. The panel draws the same things in all of those cases, so
 * what the panel is handed is those things rather than the widest of the payloads that can
 * produce them.
 */
export type InvitedLink = {
	/** which invitation this is, which is what the row a copy came from names. */
	invitationId: string;
	/** the member the link admits, as their row seals it. */
	username: string;
	joinLink: string;
	/**
	 * the code that opens the link (effort 828, requirement 1). Never absent: one code is made
	 * with the link and lives exactly as long as it, so every act that shows a link shows it.
	 */
	code: string;
	/** the moment the link and its code lapse, printed as a date beside them. */
	expiresAt: number;
	/**
	 * on a reset, the workspaces the member held that the resetting administrator could not
	 * restore. Empty on an invitation and on a link copied again.
	 */
	unreachableWorkspaces: { id: string; name: string }[];
};

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
	 * the link the last invitation, reset or copy produced, shown in the invite dialog until
	 * dismissed. Closing the dialog keeps it, since a closed sheet is not a dismissal; the
	 * panel's own done control is.
	 */
	invited: InvitedLink | null;
}>({ open: null, invited: null });

export function openOrganizationDialog(kind: OrganizationDialogKind) {
	organizationDialog.open = kind;
}

export function closeOrganizationDialog() {
	organizationDialog.open = null;
}

/**
 * a link was produced: open the invite dialog on it.
 *
 * **Three acts reach here and the panel cannot tell them apart.** An invitation, a new link on
 * somebody's row, and a pending row's copy link each end with one link and one code in one
 * person's hands, so each ends on the same panel rather than on a surface of its own.
 */
export function showInvited(invited: InvitedLink) {
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
