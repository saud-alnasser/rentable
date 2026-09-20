import type { MadeLink } from '$lib/platform/host';

/**
 * THE ORGANIZATION SURFACES, ASKED FOR IN ONE PLACE AND DRAWN IN ANOTHER
 *
 * Making an account and creating a workspace are each one form on the shared form surface, and the
 * link an account's own act produces is one panel beside them; all three are mounted once in the
 * shell by `layout/component/organization-dialogs.svelte`, and opened from places that share no
 * parent: the rail's workspace menu and the settings area. So what they share is this,
 * module-level rune state the way `layout/startup-stage.svelte.ts` is, and a request raised here
 * and answered there, the way `sync/sign-out.ts` is.
 *
 * **One host and not one per caller.** With an instance each, a link made from one place would be
 * shown in a panel the other has never seen, and a person who went looking for it would find an
 * empty form. One instance is one panel, and `madeLink` sits here rather than in the host for the
 * same reason.
 */

export type OrganizationDialogKind = 'account' | 'workspace';

export const organizationDialog = $state<{
	/** which of the two forms is open, or neither. */
	open: OrganizationDialogKind | null;
	/**
	 * the link the last link act produced, shown on its own panel until dismissed (effort 828,
	 * requirement 20). Never kept: nothing stores a link, and a person who lost the pair makes
	 * another, which drops the one they lost.
	 */
	madeLink: MadeLink | null;
}>({ open: null, madeLink: null });

export function openOrganizationDialog(kind: OrganizationDialogKind) {
	organizationDialog.open = kind;
}

export function closeOrganizationDialog() {
	organizationDialog.open = null;
}

/** a link was made: show the pair, on the one panel that shows a link and a code. */
export function showMadeLink(made: MadeLink) {
	organizationDialog.madeLink = made;
}

/** the person has taken the link: the panel goes. */
export function dismissMadeLink() {
	organizationDialog.madeLink = null;
}

/** nobody is signed in any more: nothing here outlives the session that made it. */
export function resetOrganizationDialogs() {
	organizationDialog.open = null;
	organizationDialog.madeLink = null;
}
