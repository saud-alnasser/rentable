/**
 * THE SETUP WALK, AS A DESCRIPTION
 *
 * What a first run asks of a person and what it tells them, step by step, as plain data a
 * `node:test` can read. The screen in `component/setup-walk.svelte` draws from this rather than
 * restating it, so the test that asserts **the only text typed is the organization's name, the
 * owner's username and a password** is asserting over the fields the screen actually presents
 * rather than over a list somebody remembered to keep beside it.
 *
 * Criterion 3 of the effort is the reason this exists: a field added later that asks for a slug,
 * a group, a token or a URL fails a test rather than passing review.
 *
 * **And the decisions the walk makes are here rather than in the route**, for the same reason:
 * where a refused create leaves it, whether the group has to be asked for at all, and what a
 * session already holding an organization means. Each is a function a `node:test` can call, and
 * the route is what wires them to the shell.
 */

import type { GroupState, OrganizationSession } from '$lib/platform/host';
import { toErrorDetail } from '$lib/error/message';
import { toTauriRefusalReason, type TauriRefusalReason } from '$lib/error/tauri';

/**
 * the two steps of the walk that creates, in the order a person meets them: the consent, and the
 * organization's name with the owner's username and password. Then the application: the first
 * workspace is made for the owner, named after the organization, as the first stage of the one
 * loading pass that follows (effort 832, requirement 18), and it can be renamed later. The walk
 * ends inside that workspace rather than on a screen showing the join link, which lives on the
 * organization page and is read there.
 *
 * *A third step asked for the first workspace's name until effort 832. It was the one thing the
 * walk asked for that the application could fill itself, and it cost a second busy surface before
 * the loading pass.*
 *
 * **`existing` is a third step and not a third step of this walk** (effort 828, requirement 14).
 * The consent decides which of two ways the person is on: an account holding nothing runs the
 * two steps and creates; an account already holding an organization runs the consent and this
 * one, where its owner signs in and the machine joins what is already there. It is in the type
 * because it is a step the screen draws, and out of `SETUP_WALK` because a step that walk presents
 * is one everybody meets.
 */
export type SetupStep = 'connect' | 'existing' | 'name';

export const SETUP_STEPS: readonly SetupStep[] = ['connect', 'name'];

/** the two steps of the other way: the consent, and the owner signing in to what it found. */
export const CONNECT_EXISTING_STEPS: readonly SetupStep[] = ['connect', 'existing'];

/** which of the two ways a step belongs to, which is what says where a person is and of how many. */
export function stepsOf(step: SetupStep): readonly SetupStep[] {
	return step === 'existing' ? CONNECT_EXISTING_STEPS : SETUP_STEPS;
}

/**
 * what a step asks the person to type. A field is named by what it collects, and the names are
 * the whole vocabulary: there is no `slug`, `token` or `url`, and the test says so. The
 * organization's name is a person's own word for their records and never a detail Turso wants;
 * a username is the owner's own name for themselves, the one they sign in with (requirement 21
 * of effort 824).
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
export type SetupField = 'name' | 'username' | 'password';

/**
 * what a step tells the person before it asks anything of them.
 *
 * `groupCoverage` says how far the consent reaches: every database in the group the person
 * picks, and nothing outside it. `oneOrganization` says what that group may hold: one
 * organization, and that a group already holding one is connected to rather than refused, which
 * is effort 828's requirement 14 correcting what this sentence said while the only outcome was a
 * create (826, requirement 21). `accountCreation` says why a Turso account kept for rentable
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
 * on the first; the sentences themselves are the locale's, under these names. **The list is behind
 * a disclosure** (effort 832, requirements 17 and 18): the step says one line and offers the
 * consent, and a person who wants the facts first opens them. They are the same facts, still
 * there before anything is created, and no longer standing between the reader and the button.
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

/**
 * where a refused create leaves the walk, and what it keeps of what was said.
 *
 * **The sentence is not here.** A refusal is said in the reader's language from its reason
 * (`error/refusal.ts`), and the screen asks for it where it has the translations; what this keeps
 * is the one thing a sentence cannot carry.
 */
export type SetupRefusal = {
	step: SetupStep;
	/**
	 * whether the name step has to show the group field this time. `false` on every refusal but
	 * the one Turso gives when it will take no group this application can work out.
	 */
	askGroup: boolean;
	/**
	 * What the shell said behind the refusal, Turso's own words among it, and `null` where what
	 * was thrown said nothing.
	 *
	 * **It is detail, and the walk draws it behind a disclosure.** The step the person is on says
	 * what is being asked and why, in their language; this is the machine's account behind it, in
	 * whatever language its author wrote, and a screen that leads with it is one that reports a
	 * failure where there is a step (effort 832, requirement 23).
	 */
	detail: string | null;
};

/**
 * a refusal as the walk draws it: the sentence the reader acts on, in their language, and the
 * shell's own words behind a disclosure under it, or `null` where there were none.
 */
export type WalkRefusal = { sentence: string; detail: string | null };

/**
 * whether a create's refusal is the one the walk answers with the group field: Rust refused it
 * with `groupNeeded`.
 *
 * *It matched a fixed phrase at the head of Rust's message until effort 832, and a test read the
 * phrase back out of `setup.rs` to keep the two together. The reason is that contract now, and the
 * list it belongs to is mirrored and tested in `error/tauri.ts`.*
 */
export function isTheGroupNeeded(error: unknown): boolean {
	return toTauriRefusalReason(error) === 'groupNeeded';
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
 * and the walk returns to the consent carrying the refusal.
 *
 * The second is this ticket's: Turso would take no group the application could work out, so the
 * one name left is the one the person picked on the consent screen. The signal there is the
 * `groupNeeded` reason, because nothing else about that run is different: the consent is intact,
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
	const detail = toErrorDetail(error);

	// read before the authority, because this refusal leaves the authority exactly where it was:
	// asking the machine where it stands would answer *nothing happened* and lose the one
	// refusal that needs a field drawn for it.
	if (isTheGroupNeeded(error)) {
		return { step: 'name', askGroup: true, detail };
	}

	if (holdsTursoAuthority) return null;

	return { step: 'connect', askGroup: false, detail };
}

/**
 * Which way the walk is on, decided by what the consented account turned out to hold (effort 828,
 * requirement 14).
 *
 * **The consent is where the two ways part.** Nothing before it can know: the account is the
 * person's own and this machine has never seen it. An account holding nothing goes on to name the
 * organization and create it, which is the walk as it was; an account already holding one goes to
 * the step where its owner signs in, instead of meeting the refusal that used to be the only
 * answer there.
 */
export function stepAfterConsent(group: GroupState): SetupStep {
	return group.kind === 'held' ? 'existing' : 'name';
}

/**
 * Where a failed connect leaves the walk.
 *
 * **One kind of refusal is told apart from every other, and it is told apart by the reason Rust
 * gave it.** A refusal nothing typed on the step can answer is one of `BACK_TO_THE_CONSENT`: the
 * consented account holds no organization to connect to, this machine already holds one, Turso
 * refused the account the mint was asked of, or the consent itself has to be given again. The
 * walk returns to the consent carrying it.
 *
 * `null` for every other refusal, which is every one a person can act on where they are: a wrong
 * username or password, a connection that dropped. The step keeps what was typed and marks the
 * password.
 *
 * *A machine an owner or an administrator was on used to shut this way in, and that refusal was
 * the `preconditionFailed` this read was first written for. The register gates no way in from
 * 2026-09-20. Effort 832 gave each of these refusals a reason, and the read is the list of them.*
 *
 * *It read the Turso authority instead until ticket 20, and that is a fact about this machine
 * rather than about what was refused: a connect that failed on the network, at a moment when the
 * state this machine had of itself said the authority was gone, sent the person back to grant a
 * consent they had never lost. What was refused is what the refusal says, and nothing else here
 * has to be true for it to be read.*
 */
export function refusalAfterFailedConnect(error: unknown): SetupRefusal | null {
	const reason = toTauriRefusalReason(error);

	if (!reason || !BACK_TO_THE_CONSENT.includes(reason)) return null;

	return { step: 'connect', askGroup: false, detail: toErrorDetail(error) };
}

/**
 * the refusals of a connect that nothing typed on the step can answer, so the walk goes back to
 * the consent: they are about the consented account or this machine, never about the username
 * and password.
 */
const BACK_TO_THE_CONSENT: readonly TauriRefusalReason[] = [
	'anotherOrganizationHeld',
	'consentNeededAgain',
	'groupEmpty',
	'nothingToConnectTo',
	'tursoAccountRefused',
	'tursoNotConnected',
	'tursoRefused'
];

/**
 * What the walk does for a machine that is already somebody, which is what it finds after a
 * reload or an address typed in.
 *
 * - `'leave'`: somebody is in, so the walk has nothing left to ask and the way in is where they
 *   belong. Both steps before would create the organization a second time. An owner whose
 *   organization holds no workspace yet, because the first one was not made, meets the
 *   no-workspace surface there, which offers the create. This is also what makes the dev
 *   server's own reload during a first run harmless.
 * - `null`: nobody is in, so the walk draws whichever step it was on.
 *
 * *An owner with no workspace was sent to the walk's third step until effort 832 removed it.*
 */
export function stepFor(session: OrganizationSession | null | undefined): 'leave' | null {
	return session ? 'leave' : null;
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
