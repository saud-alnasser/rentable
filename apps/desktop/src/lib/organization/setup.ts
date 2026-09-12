/**
 * THE SETUP WALK, AS A DESCRIPTION
 *
 * What a first run asks of a person and what it tells them, step by step, as plain data a
 * `node:test` can read. The screen in `component/setup-walk.svelte` draws from this rather than
 * restating it, so the test that asserts **the only text typed is the organization's name, a
 * password and the first workspace's name** is asserting over the fields the screen actually
 * presents rather than over a list somebody remembered to keep beside it.
 *
 * Criterion 3 of the effort is the reason this exists: a field added later that asks for a slug,
 * a group name, a token or a URL fails a test rather than passing review.
 */

/**
 * the three steps, in the order a person meets them: the consent, the organization's name with
 * the password, and the first workspace's name. The walk ends inside that workspace rather than
 * on a screen showing the join link, which lives on the organization page and is read there.
 */
export type SetupStep = 'connect' | 'name' | 'workspace';

export const SETUP_STEPS: readonly SetupStep[] = ['connect', 'name', 'workspace'];

/**
 * what a step asks the person to type. A field is named by what it collects, and the names are
 * the whole vocabulary: there is no `slug`, `group`, `token` or `url`, and the test says so. A
 * workspace's name is a person's own word for their records, the same as the organization's
 * name is, and never a detail Turso wants.
 */
export type SetupField = 'name' | 'password' | 'workspace';

/**
 * what a step tells the person before it asks anything of them.
 *
 * `groupPreparation` explains the empty group the consent will be granted over, which the
 * customer creates in Turso's own dashboard; explained rather than asked for, because nothing
 * available to this application can create one and a field for its name would be criterion 3
 * failing. `succession` states what it costs that the organization lives in whichever Turso
 * organization holds the group, before anything is created, in every case, because a
 * group-scoped credential cannot tell a personal account from a team one (requirement 22).
 *
 * The screen draws them as one list, a glyph to each, in this order, with the dashboard action
 * on the first; the sentences themselves are the locale's `connectGroup`, `connectAccount` and
 * `connectSuccession`.
 */
export type SetupStatement = 'groupPreparation' | 'accountCreation' | 'succession';

export type SetupStepDescription = {
	step: SetupStep;
	fields: readonly SetupField[];
	statements: readonly SetupStatement[];
};

export const SETUP_WALK: readonly SetupStepDescription[] = [
	{
		step: 'connect',
		fields: [],
		statements: ['groupPreparation', 'accountCreation', 'succession']
	},
	{
		step: 'name',
		fields: ['name', 'password'],
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

/**
 * The strength floor, as characters, checked on the machine and again in Rust. There is no server
 * to slow a guess down, so the password is the only defence and length is what a guess pays for.
 * `tauri/src/organization/setup.rs` carries the same number and a test on each side pins it.
 */
export const PASSWORD_FLOOR = 12;

/** the same bound the workspace name has, for the same reason: a name has to fit on a row. */
export const ORGANIZATION_NAME_LIMIT = 120;

/** where the person makes a Turso account and, before consenting, the empty group. */
export const TURSO_DASHBOARD_URL = 'https://app.turso.tech';
