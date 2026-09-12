import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ar from '$lib/i18n/ar/index.ts';
import en from '$lib/i18n/en/index.ts';
import {
	PASSWORD_FLOOR,
	SETUP_WALK,
	fieldsPresented,
	statementsBeforeCreation
} from '$lib/organization/setup.ts';

/**
 * THE WALK, ASSERTED OVER
 *
 * Criterion 3 of the effort: **the only text entered into this application is the
 * organization's name and a password**. The screen draws its fields from `SETUP_WALK`, so this
 * is an assertion over what the screen presents and not over a list kept beside it, and a field
 * added later that asks for a slug, a group name, a token or a URL fails here before it reaches
 * review. `setup-walk.svelte.test.ts` asserts the same thing over the rendered DOM.
 */

test('the only fields the walk presents are the name and a password', () => {
	assert.deepEqual(fieldsPresented(), ['name', 'password']);
});

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

test('the walk ends where it began: three steps, and the link is the last', () => {
	assert.deepEqual(
		SETUP_WALK.map((step) => step.step),
		['connect', 'name', 'done']
	);
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

// requirement 22: the statement names group transfer as the customer's, performed in Turso, and
// offers it nowhere here.
test('the succession statement names turso as where a group moves, in both locales', () => {
	assert.match(en.organization.setup.succession, /turso/i);
	assert.match(en.organization.setup.succession, /move a group|transfer/i);
	assert.match(en.organization.setup.succession, /rentable does neither/i);
	assert.match(ar.organization.setup.succession, /Turso/);
	assert.match(ar.organization.setup.succession, /نقل/);
});
