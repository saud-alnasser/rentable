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
 * - `workspace`: one workspace is past what this build reads. The update-required screen stands in
 *   place of it, and the session's other workspaces stay open to the person.
 * - `organization`: every other refusal to open what was asked for. The organization could not be
 *   opened, so the person goes back to the organization switcher, with the reason recorded
 *   against that organization.
 *
 * `null` is a failure that carried no reason: something broke rather than refused, which is the
 * generic failure screen's.
 */
export type RefusalKind = 'password' | 'link' | 'workspace' | 'organization';

/** what the wall's own fields answer. */
const ABOUT_THE_PASSWORD: readonly string[] = [
	'credentialsWrong',
	'passwordTooShort',
	'passwordChangeRequired',
	'usernameInvalid',
	'locked'
];

/** what the join screen's form, or a new link, answers. */
const ABOUT_THE_LINK: readonly string[] = [
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

/** a workspace upgraded past what this build reads. */
const WORKSPACE_BY_VERSION = 'workspaceNewer';

/**
 * an organization upgraded past what this build reads, or past what it writes on a way in that
 * has to write: updating rentable is the way past either.
 */
const ORGANIZATION_BY_VERSION: readonly string[] = [
	'organizationNewer',
	'organizationReadOnlyByVersion'
];

/** whose a refusal is, by its reason; `null` where the failure carried none. */
export function refusalKind(reason: string | null): RefusalKind | null {
	if (reason === null) return null;
	if (ABOUT_THE_PASSWORD.includes(reason)) return 'password';
	if (ABOUT_THE_LINK.includes(reason)) return 'link';
	if (reason === WORKSPACE_BY_VERSION) return 'workspace';

	return 'organization';
}

/** whether updating rentable is the way past an organization's refusal. */
export function isOrganizationByVersion(reason: string | null) {
	return reason !== null && ORGANIZATION_BY_VERSION.includes(reason);
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
 * 12), and the update-required screen says it the way every other refusal is said.
 */
export const workspaceNewer = (detail: string) => ({
	code: 'refused' as const,
	reason: 'workspaceNewer' as const,
	message: detail
});
