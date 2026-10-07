import type { TauriRefusalReason } from '$lib/error/tauri';

/**
 * WHOSE A REFUSAL IS
 *
 * Where startup sends a person the shell refused, read off the refusal's reason (effort 857,
 * requirements 7 and 8, as the human amended them on 2026-10-07: "if an issue with an org that
 * cannot open just make it back to the switch between orgs and on the switch show small callout
 * above when the org is choose about the kind of error it has").
 *
 * - `password`: what was typed did not open the vault. The wall says it under its fields, as it
 *   always has.
 * - `link`: the link or its code. The join screen says it on its own form.
 * - `organization`: the organization itself cannot be opened, or the person cannot stay in it.
 *   They go back to the organization switcher, with the reason recorded against that
 *   organization.
 * - `workspace`: every other refusal. It is about one workspace, or about something that failed
 *   in it, so the organization still opens: the screen standing in place of that workspace says
 *   the reason, and the session's other workspaces stay open to the person. Where nobody is in
 *   yet, there is no workspace for it to be about, and the caller treats it as the
 *   organization's.
 *
 * **The organization's reasons are listed and the workspace's are the rest** (ticket 25). They
 * were the other way round, and a workspace a member could not bring up, or a full disk under its
 * copy, signed the person out of the whole organization, and every sign-in after met the same
 * workspace again. A reason added later keeps the person in until it is listed here.
 *
 * `null` is a failure that carried no reason: something broke rather than refused, which is the
 * generic failure screen's.
 */
export type RefusalScope = 'password' | 'link' | 'organization' | 'workspace';

/** what the wall's own fields answer. */
const ABOUT_THE_PASSWORD: readonly TauriRefusalReason[] = [
	'credentialsWrong',
	'passwordTooShort',
	'passwordChangeRequired',
	'usernameInvalid',
	'locked'
];

/** what the join screen's form, or a new link, answers. */
const ABOUT_THE_LINK: readonly TauriRefusalReason[] = [
	'lapsed',
	'consumed',
	'revoked',
	'codeMissing',
	'codeWrong',
	'linkUnreadable',
	'linkNotAnInvitation',
	'linkNotForAMachine',
	'linkLifetime',
	'linkNotOutstanding'
];

/**
 * an organization upgraded past what this build reads, or past what it writes on a way in that
 * has to write: updating rentable is the way past either.
 */
const ORGANIZATION_BY_VERSION: readonly TauriRefusalReason[] = [
	'organizationNewer',
	'organizationReadOnlyByVersion'
];

/**
 * the organization cannot be opened on this machine, or the session in it is over: its format,
 * this machine's hold on it, or the person's place in it.
 *
 * **Every reason the state read, a sign-in or a workspace's open raises about these is here**
 * (ticket 31): `memberGone` is the state read's own when the person's row has gone, and it was
 * left to the default and kept them in a session with no member behind it. `machineMissing`, a
 * machine no longer signed in as the person, is listed beside it. `upgradeUnderWay` is not: it is
 * another member's upgrade in progress, which a retry answers once they finish, so the session
 * stands and it is the workspace's, as every act's refusal is.
 */
const ABOUT_THE_ORGANIZATION: readonly TauriRefusalReason[] = [
	...ORGANIZATION_BY_VERSION,
	'organizationOlder',
	'organizationUpgradeOffline',
	'organizationChangesUnsendable',
	'organizationCredentialLapsed',
	'noOrganizationCredential',
	'noOrganization',
	'noMemberYet',
	'signedOut',
	'signInAgain',
	'youWereRemoved',
	'sessionsEnded',
	'keyNotInForce',
	'memberGone',
	'machineMissing'
];

/**
 * a workspace upgraded past what this build reads or writes, or one behind it in an organization
 * upgraded past what this build writes (ticket 31): updating rentable is the way past.
 */
const WORKSPACE_BY_VERSION: readonly TauriRefusalReason[] = [
	'workspaceNewer',
	'workspaceReadOnlyByVersion',
	'workspaceBehindReadOnlyByVersion'
];

/** whose a refusal is, by its reason; `null` where the failure carried none. */
export function refusalScope(reason: TauriRefusalReason | null): RefusalScope | null {
	if (reason === null) return null;
	if (ABOUT_THE_PASSWORD.includes(reason)) return 'password';
	if (ABOUT_THE_LINK.includes(reason)) return 'link';
	if (ABOUT_THE_ORGANIZATION.includes(reason)) return 'organization';

	return 'workspace';
}

/** whether updating rentable is the way past an organization's refusal. */
export function isOrganizationByVersion(reason: TauriRefusalReason | null) {
	return reason !== null && ORGANIZATION_BY_VERSION.includes(reason);
}

/** whether updating rentable is the way past a workspace's refusal. */
export function isWorkspaceByVersion(reason: TauriRefusalReason | null) {
	return reason !== null && WORKSPACE_BY_VERSION.includes(reason);
}

/**
 * the refusal a resume held by the version stands for, as the shell would have thrown it: the
 * resume's refusal is carried on the organization's state rather than thrown (effort 857, ticket
 * 04), and saying it the way every other refusal is said is what puts it in the reader's language.
 */
export const organizationNewer = (detail: string) => ({
	code: 'refused' as const,
	reason: 'organizationNewer' as const,
	message: detail
});

/**
 * the refusal a workspace held below its read floor stands for, as the shell would have thrown it:
 * a heartbeat's pull carries the verdict on its answer rather than throwing it (effort 857, ticket
 * 12), and the workspace-held screen says it the way every other refusal is said.
 */
export const workspaceNewer = (detail: string) => ({
	code: 'refused' as const,
	reason: 'workspaceNewer' as const,
	message: detail
});
