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
 * a group, a token or a URL fails a test rather than passing review.
 *
 * **And the decisions the walk makes are here rather than in the route**, for the same reason:
 * where a refused create leaves it, whether the group has to be asked for at all, and what a
 * session already holding an organization means. Each is a function a `node:test` can call, and
 * the route is what wires them to the shell.
 */

import type { OrganizationSession } from '$lib/platform/host';
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
 * the whole vocabulary: there is no `slug`, `token` or `url`, and the test says so. A
 * workspace's name is a person's own word for their records, the same as the organization's
 * name is, and never a detail Turso wants; a username is the owner's own name for themselves,
 * the one they sign in with (requirement 21 of effort 824).
 *
 * **`group` is not among them, and that is the whole of what this ticket changed.** Turso began
 * refusing a create that names no group on 2026-09-15, and for a day the walk asked for it as a
 * fourth field. It asks for nothing now: Rust tries the create with no group, then with Turso's
 * own default, then with the group uuid the consent token carries, and a group that already
 * holds anything named itself in the listing. The field exists for the one case where all of
 * that was refused, and it is drawn outside this description because it is not a step's field.
 * It is the last resort, and [`refusalAfterFailedCreate`] is what puts it on screen. The connect
 * step says beforehand that it is coming, under `groupAskedOnce`, so the person who meets it is
 * meeting a step they were told about rather than a create that went wrong.
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
 * `groupAskedOnce` is the one this ticket added, and it is here rather than left to the moment
 * it happens: a group holding nothing yet is the one case the application cannot name on its
 * own, so the next step asks for the name, once. Said beforehand it is a step; met for the first
 * time after a create was refused it reads as a failure, and it is neither.
 *
 * **Nothing here asks for a group to be made.** The walk used to, and the plan limit is why it
 * no longer does.
 *
 * The screen draws them as one list, a glyph to each, in this order, with the dashboard action
 * on the first; the sentences themselves are the locale's, under these names.
 */
export type SetupStatement =
	'groupCoverage' | 'oneOrganization' | 'accountCreation' | 'succession' | 'groupAskedOnce';

export type SetupStepDescription = {
	step: SetupStep;
	fields: readonly SetupField[];
	statements: readonly SetupStatement[];
};

export const SETUP_WALK: readonly SetupStepDescription[] = [
	{
		step: 'connect',
		fields: [],
		statements: [
			'groupCoverage',
			'oneOrganization',
			'accountCreation',
			'succession',
			'groupAskedOnce'
		]
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
	/**
	 * whether the name step has to show the group field this time. `false` on every refusal but
	 * the one Turso gives when it will take no group this application can work out.
	 */
	askGroup: boolean;
	/**
	 * Turso's own account of why, split off the fixed phrase, and `null` on every refusal that
	 * carries none.
	 *
	 * **It is detail, and the walk draws it as detail.** The step the person is on already says
	 * what is being asked and why, in their language; this is the machine's account behind it,
	 * in Turso's words and never in theirs, and a screen that leads with it is one that reports
	 * a failure where there is a step.
	 */
	detail: string | null;
};

/**
 * The fixed phrase Rust's refusal begins with when Turso would take none of the groups it tried.
 *
 * **A phrase rather than an error code**, because what it marks is one sentence rather than a
 * kind of failure: `organization/setup.rs` formats it and the rest of that message is Turso's
 * own words, which are free to change. `tests/setup.test.ts` reads the constant back out of
 * `setup.rs`, so the two cannot drift apart without a test saying so.
 */
export const THE_GROUP_IS_NEEDED = "the turso group's name is needed";

/** whether a create's refusal is the one the walk answers with the group field. */
export function isTheGroupNeeded(error: unknown): boolean {
	return toErrorDetail(error)?.startsWith(THE_GROUP_IS_NEEDED) ?? false;
}

/**
 * What the refusal says after the phrase, which is everything about it that is not a contract.
 *
 * **The split is on the phrase and on nothing else.** What follows it is Rust's framing and
 * Turso's last reason inside it, and both are free to change; a split that looked for the words
 * around the reason would be reading a sentence nobody promised. Leading punctuation and space
 * go with the phrase, so what comes back starts a line of its own.
 */
function detailAfterThePhrase(message: string): string | null {
	const rest = message.slice(THE_GROUP_IS_NEEDED.length).replace(/^[.,;:\s]+/, '');

	return rest.length > 0 ? rest : null;
}

/**
 * Where a failed create leaves the walk.
 *
 * **Two refusals are told apart from every other, and each by the one signal it leaves.**
 *
 * The first is requirement 21's: a group that already holds an organization is no use for this
 * one, so Rust refuses before creating anything and gives the consent back. A machine that no
 * longer holds the authority cannot create an organization from the name step however many
 * times it is pressed, so the signal is the authority, which is a fact the walk already reads,
 * and the walk returns to the consent carrying the refusal's own sentence unchanged.
 *
 * The second is this ticket's: Turso would take no group the application could work out, so the
 * one name left is the one the person picked on the consent screen. The signal there is the
 * fixed phrase above, because nothing else about that run is different: the consent is intact,
 * the machine still holds the authority, and the walk stays on the step it is on with the group
 * field drawn on it.
 *
 * `null` where neither holds: the shared handler has already said what went wrong and the walk
 * stays where it is with what was typed still in the fields.
 */
export function refusalAfterFailedCreate(
	error: unknown,
	holdsTursoAuthority: boolean
): SetupRefusal | null {
	const message = toErrorDetail(error);

	// read before the authority, because this refusal leaves the authority exactly where it was:
	// asking the machine where it stands would answer *nothing happened* and lose the one
	// refusal that needs a field drawn for it.
	if (message?.startsWith(THE_GROUP_IS_NEEDED)) {
		return { step: 'name', message, askGroup: true, detail: detailAfterThePhrase(message) };
	}

	if (holdsTursoAuthority) return null;

	return { step: 'connect', message, askGroup: false, detail: null };
}

/**
 * What the walk does for a machine that is already somebody, which is what it finds after a
 * reload, an address typed in, or the create that has just signed the owner in.
 *
 * - `'workspace'`: an owner is in and their organization holds nothing yet, so the third step is
 *   where they are, whatever step this route was opened at. The first two would create the
 *   organization a second time.
 * - `'leave'`: they are in and there is a workspace to open, so the walk has nothing left to ask
 *   and the way in is where they belong. This is the reload during a first run that used to put
 *   a finished owner back on a step, and it is what makes the dev server's own reload harmless.
 * - `null`: nobody is in, so the walk draws whichever step it was on.
 */
export function stepFor(
	session: Pick<OrganizationSession, 'workspaces'> | null | undefined
): 'workspace' | 'leave' | null {
	if (!session) return null;

	return session.workspaces.length === 0 ? 'workspace' : 'leave';
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
