import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ar from '$lib/i18n/ar/index.ts';
import en from '$lib/i18n/en/index.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import {
	PASSWORD_FLOOR,
	SETUP_WALK,
	fieldsPresented,
	statementsBeforeCreation
} from '$lib/organization/setup.ts';
import { USERNAME_MAX, USERNAME_MIN, usernameSchema } from '$lib/organization/username-form.ts';
import { workspaceFormSchema } from '$lib/organization/workspace-form.ts';
import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace.ts';

/**
 * THE WALK, ASSERTED OVER
 *
 * Criterion 3 of effort 819: **the only text entered into this application is the
 * organization's name and a password**, and since effort 824 the first workspace's name, which
 * is a person's own word for their records exactly as the organization's name is, and the
 * owner's username, which is their own name for themselves (requirement 21); neither is a Turso
 * detail. The screen draws its fields from `SETUP_WALK`, so this is an assertion over what the
 * screen presents and not over a list kept beside it, and a field added later that asks for a
 * slug, a group name, a token or a URL fails here before it reaches review.
 * `setup-walk.svelte.test.ts` asserts the same thing over the rendered DOM.
 */

test('the only fields the walk presents are the name, a username, a password and the workspace', () => {
	assert.deepEqual(fieldsPresented(), ['name', 'username', 'password', 'workspace']);
});

// a workspace's name is the person's word, like the organization's, so it passes here the way
// the name does; what this refuses is a word Turso would want.
test('nothing in the walk asks for a slug, a group, a token or a URL', () => {
	const forbidden = /slug|group|token|url|host|secret/i;

	for (const step of SETUP_WALK) {
		for (const field of step.fields) {
			assert.doesNotMatch(field, forbidden, `the ${step.step} step asks for ${field}`);
		}
	}
});

// requirement 3: the group is explained, not asked for. requirement 22: succession is stated
// before anything is created, in every case, because the application cannot tell which case it
// is in.
test('the group preparation and what succession costs are said before the organization is created', () => {
	const statements = statementsBeforeCreation();

	assert.ok(statements.includes('groupPreparation'));
	assert.ok(statements.includes('succession'));
	assert.ok(statements.includes('accountCreation'));

	// and said on a step that asks for nothing, so explaining never becomes asking.
	const explaining = SETUP_WALK.find((step) => step.statements.includes('groupPreparation'));

	assert.deepEqual(explaining?.fields, []);
});

// effort 824, requirement 3: the walk ends inside the workspace. The last step names it, asks
// for nothing else, and there is no step after it showing the link.
test('the walk is three steps, and the workspace is the last', () => {
	assert.deepEqual(
		SETUP_WALK.map((step) => step.step),
		['connect', 'name', 'workspace']
	);
	assert.deepEqual(SETUP_WALK.at(-1)?.fields, ['workspace']);
	assert.deepEqual(SETUP_WALK.at(-1)?.statements, []);
});

// effort 824, requirement 21: the owner sets their own username on the step that creates the
// organization, beside its name and their password, and nowhere else.
test('the name step asks for the name, the username and the password, in that order', () => {
	const naming = SETUP_WALK.find((step) => step.step === 'name');

	assert.deepEqual(naming?.fields, ['name', 'username', 'password']);
	assert.equal(
		SETUP_WALK.filter((step) => step.fields.includes('username')).length,
		1,
		'the username is asked for once'
	);
});

/**
 * Effort 824, requirement 5: the connect step's three facts became a list of shorter sentences.
 * The paragraphs they replaced are kept here as a literal rather than in the locale, so that
 * the sentences stay shorter than what they replaced and not merely shorter than each other.
 */
const PARAGRAPHS_REPLACED = [
	"first, in turso's own dashboard, create an empty group for rentable and pick it on the consent screen. the consent grants rentable authority over that one group, so an empty one keeps that authority to the databases rentable creates.",
	'no turso account yet? the consent screen is where you make one.',
	'the organization will live in whichever turso organization holds the group you pick. if that is a personal account, only you can grant rentable authority over it again. a second administrator on a turso organization can do the same, and turso can move a group to another organization from its own dashboard. rentable does neither for you.'
];

const words = (sentences: readonly string[]) =>
	sentences.reduce((count, sentence) => count + sentence.trim().split(/\s+/).length, 0);

test('the three connect items together are shorter than the three paragraphs they replaced', () => {
	const items = [
		en.organization.setup.connectGroup,
		en.organization.setup.connectAccount,
		en.organization.setup.connectSuccession
	];

	assert.ok(
		words(items) < words(PARAGRAPHS_REPLACED),
		`${words(items)} words against ${words(PARAGRAPHS_REPLACED)}`
	);
	// and each still says something, in both locales, written rather than copied.
	for (const key of ['connectGroup', 'connectAccount', 'connectSuccession'] as const) {
		assert.ok(en.organization.setup[key].length > 0, key);
		assert.ok(ar.organization.setup[key].length > 0, key);
		assert.notEqual(ar.organization.setup[key], en.organization.setup[key], key);
	}
});

/**
 * The strength floor is one number in two languages and two runtimes. Rust refuses below it
 * before asking anything of Turso; the form refuses below it on the field; both locales say it.
 * None of them imports the others, so this is what holds the four together.
 */
test('the password floor is the same number in Rust, on the form, and in both locales', async () => {
	const rust = await readFile(
		fileURLToPath(new URL('../../../../tauri/src/organization/setup.rs', import.meta.url)),
		'utf8'
	);
	const declared = /pub const MINIMUM_PASSWORD_LENGTH: usize = (\d+);/.exec(rust);

	assert.equal(Number(declared?.[1]), PASSWORD_FLOOR);
	assert.match(en.organization.setup.passwordFloor, new RegExp(`\\b${PASSWORD_FLOOR}\\b`));
	assert.match(en.organization.setup.passwordTooShort, new RegExp(`\\b${PASSWORD_FLOOR}\\b`));
	assert.match(ar.organization.setup.passwordFloor, new RegExp(`${PASSWORD_FLOOR}`));
	assert.match(ar.organization.setup.passwordTooShort, new RegExp(`${PASSWORD_FLOOR}`));
});

// requirement 22 of effort 819: the statement names group transfer as the customer's, performed
// in Turso, and offers it nowhere here. Shorter since effort 824, and it still says so.
test('the succession item names turso as where a group moves, in both locales', () => {
	assert.match(en.organization.setup.connectSuccession, /turso/i);
	assert.match(en.organization.setup.connectSuccession, /move a group|transfer/i);
	assert.match(en.organization.setup.connectSuccession, /rentable does neither/i);
	assert.match(ar.organization.setup.connectSuccession, /Turso/);
	assert.match(ar.organization.setup.connectSuccession, /نقل/);
});

/**
 * Requirement 21 of the redesign: the walk's `name` step, the invite dialog and the rename
 * dialog each read the one username schema, so a username outside the rules is refused with
 * the same sentence wherever it was typed. This pins the bounds and that sentence to the schema
 * they all read; `members.svelte.test.ts` pins the English sentence to Rust's `USERNAME_RULES`,
 * so the three forms, the router and the command cannot refuse the same name in two voices.
 */
test('a username outside the rules is refused with the one sentence every form reads', () => {
	assert.equal(USERNAME_MIN, 3);
	assert.equal(USERNAME_MAX, 32);

	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);

		const schema = usernameSchema(i18nObject(locale));
		const rules = { en, ar }[locale].organization.dashboard.usernameRules;

		for (const refused of [
			'ab',
			'a'.repeat(USERNAME_MAX + 1),
			'sami staff',
			'sami@example.com',
			'سامي',
			'   '
		]) {
			const outcome = schema.safeParse(refused);

			assert.equal(outcome.success, false, `${locale}: ${JSON.stringify(refused)} is admitted`);
			assert.ok(
				outcome.error?.issues.every((issue) => issue.message === rules),
				`${locale}: ${JSON.stringify(refused)} is refused in another voice`
			);
		}

		// and the bounds themselves are admitted, trimmed, with the whole character set.
		for (const admitted of ['abc', 'a'.repeat(USERNAME_MAX), ' Sami.Staff_2-b ']) {
			const outcome = schema.safeParse(admitted);

			assert.equal(outcome.success, true, `${locale}: ${JSON.stringify(admitted)} is refused`);
			assert.equal(outcome.data, admitted.trim());
		}
	}
});

/**
 * Requirement 13 of the redesign: the no-workspace surface, the walk's last step and the
 * new-workspace dialog each draw the one workspace form, so a name over the limit is refused
 * with the same sentence wherever it was typed. This pins that sentence to the schema they all
 * read, and the surfaces' own tests have one thing to equal.
 */
test('a workspace name over the limit is refused with the one sentence every surface reads', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);

		const schema = workspaceFormSchema(i18nObject(locale));
		const messages = { en, ar }[locale].workspace;

		const overTheLimit = schema.safeParse({ name: 'n'.repeat(WORKSPACE_NAME_LIMIT + 1) });

		assert.equal(overTheLimit.success, false);
		assert.deepEqual(
			overTheLimit.error?.issues.map((issue) => issue.message),
			[messages.nameTooLong],
			`${locale}: the over-limit message`
		);

		const empty = schema.safeParse({ name: '   ' });

		assert.equal(empty.success, false);
		assert.deepEqual(
			empty.error?.issues.map((issue) => issue.message),
			[messages.nameRequired],
			`${locale}: the required message`
		);

		// and the bound itself is admitted, trimmed, which is the row's own rule.
		const atTheBound = schema.safeParse({ name: ` ${'n'.repeat(WORKSPACE_NAME_LIMIT)} ` });

		assert.equal(atTheBound.success, true);
		assert.equal(atTheBound.data?.name, 'n'.repeat(WORKSPACE_NAME_LIMIT));
	}
});
