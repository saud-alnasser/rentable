/**
 * THE SETUP WALK, AS A DESCRIPTION
 *
 * What a first run asks of a person and what it tells them, step by step, as plain data a
 * `node:test` can read. The screen in `component/setup-walk.svelte` draws from this rather than
 * restating it, so the test that asserts **the only text typed is the organization's name, the
 * owner's username, a password and the first workspace's name** is asserting over the fields the
 * screen actually presents rather than over a list somebody remembered to keep beside it.
 *
 * Criterion 3 of the effort is the reason this exists: a field added later that asks for a slug,
 * a group name, a token or a URL fails a test rather than passing review.
 */

import { toErrorDetail } from '$lib/error/message';

/**
 * the three steps, in the order a person meets them: the consent, the organization's name with
 * the owner's username and password, and the first workspace's name. The walk ends inside that
 * workspace rather than on a screen showing the join link, which lives on the organization page
 * and is read there.
 */
export type SetupStep = 'connect' | 'name' | 'workspace';

export const SETUP_STEPS: readonly SetupStep[] = ['connect', 'name', 'workspace'];

/**
 * what a step asks the person to type. A field is named by what it collects, and the names are
 * the whole vocabulary: there is no `slug`, `group`, `token` or `url`, and the test says so. A
 * workspace's name is a person's own word for their records, the same as the organization's
 * name is, and never a detail Turso wants; a username is the owner's own name for themselves,
 * the one they sign in with (requirement 21 of effort 824).
 */
export type SetupField = 'name' | 'username' | 'password' | 'workspace';

/**
 * what a step tells the person before it asks anything of them.
 *
 * `groupCoverage` says how far the consent reaches: every database in the group the person
 * picks, and nothing outside it. `oneOrganization` says what that group may hold: one
 * organization, so a group already holding one refuses the run before anything is created, and
 * saying it here is what keeps that refusal from being the first the person hears of the rule
 * (requirement 21). `accountCreation` says why a Turso account kept for rentable
 * alone is the clean choice, which is the one-group fact rather than a preference: a Free or
 * Developer account has exactly one group and the consent screen offers no way to make a
 * second, so on those plans the only group there is to pick is the one already holding
 * everything else, and only a paid account can offer an empty one. `succession` states what it
 * costs that the organization lives in whichever Turso organization holds the group, before
 * anything is created, in every case, because a group-scoped credential cannot tell a personal
 * account from a team one (requirement 22 of effort 819).
 *
 * **Nothing here asks for a group to be made.** The walk used to, and the plan limit is why it
 * no longer does.
 *
 * The screen draws them as one list, a glyph to each, in this order, with the dashboard action
 * on the first; the sentences themselves are the locale's, under these names.
 */
export type SetupStatement = 'groupCoverage' | 'oneOrganization' | 'accountCreation' | 'succession';

export type SetupStepDescription = {
	step: SetupStep;
	fields: readonly SetupField[];
	statements: readonly SetupStatement[];
};

export const SETUP_WALK: readonly SetupStepDescription[] = [
	{
		step: 'connect',
		fields: [],
		statements: ['groupCoverage', 'oneOrganization', 'accountCreation', 'succession']
	},
	{
		step: 'name',
		fields: ['name', 'username', 'password'],
		statements: []
	},
	{
		step: 'workspace',
		fields: ['workspace'],
		statements: []
	}
];

/** every field the whole walk presents, in order. */
export function fieldsPresented(walk: readonly SetupStepDescription[] = SETUP_WALK): SetupField[] {
	return walk.flatMap((step) => step.fields);
}

/** the statements shown before the step that creates anything. */
export function statementsBeforeCreation(
	walk: readonly SetupStepDescription[] = SETUP_WALK
): SetupStatement[] {
	const creating = walk.findIndex((step) => step.fields.includes('password'));

	return walk
		.slice(0, creating < 0 ? walk.length : creating + 1)
		.flatMap((step) => step.statements);
}

/** where a refused create leaves the walk, and what it has to say when it gets there. */
export type SetupRefusal = {
	step: SetupStep;
	/** the refusal's own sentence, and `null` where what was thrown carried no readable one. */
	message: string | null;
};

/**
 * Where a failed create leaves the walk.
 *
 * **The walk asks the machine where it stands rather than reading the refusal for a keyword.**
 * A create that fails ordinarily leaves the consent alone, and the person tries again on the
 * step they are on with what they typed still in the fields. The one refusal that does not is
 * requirement 21's: a group that already holds an organization is no use for this one, so Rust
 * refuses before creating anything and gives the consent back, and a machine that no longer
 * holds the authority cannot create an organization from the name step however many times it is
 * pressed. So the signal is the authority, which is a fact the walk already reads, and the
 * sentence shown is the refusal's own, unchanged, because it names the database in the way.
 *
 * `null` where the machine still holds the authority: the shared handler has already said what
 * went wrong and the walk stays where it is.
 */
export function refusalAfterFailedCreate(
	error: unknown,
	holdsTursoAuthority: boolean
): SetupRefusal | null {
	if (holdsTursoAuthority) return null;

	return { step: 'connect', message: toErrorDetail(error) };
}

/**
 * The strength floor, as characters, checked on the machine and again in Rust. There is no server
 * to slow a guess down, so the password is the only defence and length is what a guess pays for.
 * `tauri/src/organization/setup.rs` carries the same number and a test on each side pins it.
 */
export const PASSWORD_FLOOR = 12;

/** the same bound the workspace name has, for the same reason: a name has to fit on a row. */
export const ORGANIZATION_NAME_LIMIT = 120;

/** where the person makes a Turso account and reads what a group of theirs already holds. */
export const TURSO_DASHBOARD_URL = 'https://app.turso.tech';
