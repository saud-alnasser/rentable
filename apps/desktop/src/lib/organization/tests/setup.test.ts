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
	THE_GROUP_IS_NEEDED,
	fieldsPresented,
	refusalAfterFailedCreate,
	statementsBeforeCreation,
	stepFor
} from '$lib/organization/setup.ts';
import { fakeOrganizationSession, fakeOrganizationWorkspace } from '$lib/platform/tests/testing.ts';
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
 * slug, a group, a token or a URL fails here before it reaches review.
 * `setup-walk.svelte.test.ts` asserts the same thing over the rendered DOM.
 *
 * **The group was a field here for one day and is not one now.** Turso began refusing a create
 * that names no group on 2026-09-15 and requirement 13's first correction added a fourth field;
 * its second correction took it back out. Rust tries the create with no group, then with Turso's
 * own default, then with the group uuid the consent token carries, and a group that already
 * holds anything named itself in the listing. What is left is a field the walk draws only when
 * Turso has refused all of that, which is not something the walk presents and is asserted in
 * `setup-walk.svelte.test.ts` where a person can be shown it.
 */

test('the only fields the walk presents are the name, a username, a password and the workspace', () => {
	assert.deepEqual(fieldsPresented(), ['name', 'username', 'password', 'workspace']);
});

// requirement 13: what the consent covers is explained, and no group is asked for. requirement 22
// of effort 819: succession is stated before anything is created, in every case, because the
// application cannot tell which case it is in.
test('what the consent covers and what succession costs are said before the organization is created', () => {
	const statements = statementsBeforeCreation();

	assert.deepEqual(statements, [
		'groupCoverage',
		'oneOrganization',
		'accountCreation',
		'succession',
		'groupAskedOnce'
	]);

	// and said on a step that asks for nothing, so explaining never becomes asking.
	const explaining = SETUP_WALK.find((step) => step.statements.includes('groupCoverage'));

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
// organization, beside its name and their password, and nowhere else. All three are the person's
// own words, and nothing Turso wants is beside them.
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

/** the four that replaced those paragraphs, and the four the word count above is about. */
const REPLACING_KEYS = [
	'groupCoverage',
	'oneOrganization',
	'accountCreation',
	'succession'
] as const;

/**
 * What the fifth statement replaced, which was never a paragraph on this step.
 *
 * Requirement 13's fourth correction: the one case the application cannot name the group in is
 * an empty group not called `default`, and until this ticket the first a person heard of it was
 * a create that had already failed, whose whole sentence arrived as a toast. The step now says
 * beforehand that the name will be asked for, so what the sentence has to beat is that refusal
 * rather than a paragraph. Rust's half of it is what is pinned, without Turso's own reason
 * after the colon: the reason varies with whatever Turso last said, and a budget that counted
 * it would grow whenever Turso got wordier.
 */
const REFUSAL_REPLACED =
	"the turso group's name is needed. turso refused every group this application could name on its own, and said:";

/** the statements the connect step draws, in the order a person meets them. */
const STATEMENT_KEYS = [...REPLACING_KEYS, 'groupAskedOnce'] as const;

/** what the Arabic connect step said while it still asked for a group, kept for the guard. */
const AR_WAS = 'في لوحة تحكم Turso، أنشئ مجموعة فارغة لـ rentable ثم اخترها في شاشة الموافقة.';

const words = (sentences: readonly string[]) =>
	sentences.reduce((count, sentence) => count + sentence.trim().split(/\s+/).length, 0);

test('the connect items together are shorter than the three paragraphs they replaced', () => {
	const items = REPLACING_KEYS.map((key) => en.organization.setup[key]);

	assert.ok(
		words(items) < words(PARAGRAPHS_REPLACED),
		`${words(items)} words against ${words(PARAGRAPHS_REPLACED)}`
	);

	// and the fifth, which replaced no paragraph, is shorter than the refusal it replaced. The
	// property is the same one: every sentence on this step is shorter than what a person read
	// before it existed.
	const asked = [en.organization.setup.groupAskedOnce];

	assert.ok(
		words(asked) < words([REFUSAL_REPLACED]),
		`${words(asked)} words against ${words([REFUSAL_REPLACED])}`
	);

	// and each still says something, in both locales, written rather than copied.
	for (const key of STATEMENT_KEYS) {
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
// in Turso, and offers it nowhere here. Shorter again since the redesign, and it still says so.
test('the succession item names turso as where a group moves, in both locales', () => {
	assert.match(en.organization.setup.succession, /turso/i);
	assert.match(en.organization.setup.succession, /move a group|transfer/i);
	assert.match(en.organization.setup.succession, /rentable does neither/i);
	assert.match(ar.organization.setup.succession, /Turso/);
	assert.match(ar.organization.setup.succession, /نقل/);
});

/**
 * Requirement 13 of the redesign, requirement 21 for the fourth, and requirement 13's fourth
 * correction for the fifth: the sentences a person reads before the consent, pinned as literals
 * in both locales rather than read out of the locale and compared with themselves. A rewrite of any of them is then a deliberate edit here
 * as well, which is the point: what this step says is the requirement, and the locale file is
 * only where it is kept.
 *
 * The one-group fact in `accountCreation` is Turso's own plan limit rather than a preference,
 * and it comes from
 * [[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-an-organization-with-members-costs-on-turso]]
 * and
 * [[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-a-turso-member-can-do-through-the-consent]].
 */
const STATEMENTS = {
	en: {
		groupCoverage:
			'the consent covers every database in the group you choose, and nothing outside it.',
		oneOrganization:
			'a group holds one organization. a group that already holds one is refused here, before anything is created.',
		accountCreation:
			'a free or developer turso account has exactly one group, so an account kept for rentable alone is the clean choice, and the consent screen is where you make one. on a paid account, pick an empty group.',
		succession:
			'on a personal account only you can grant access again; in a turso organization any admin can, and turso can move a group. rentable does neither for you.',
		groupAskedOnce:
			'a group holding nothing yet is asked its name once, on the next step; turso names it nowhere.'
	},
	ar: {
		groupCoverage: 'تشمل الموافقة كل قاعدة بيانات في المجموعة التي تختارها، ولا شيء خارجها.',
		oneOrganization:
			'تحمل المجموعة الواحدة مؤسسة واحدة، لذا تُرفض المجموعة التي تحمل مؤسسة بالفعل قبل أن يُنشأ أي شيء.',
		accountCreation:
			'لا يحمل حساب Turso المجاني أو حساب Developer سوى مجموعة واحدة، لذا يبقى تخصيص حساب لـ rentable وحده هو الخيار الأنظف، وشاشة الموافقة تفتح لك حساباً إن لم يكن لديك واحد. أما في الحساب المدفوع فاختر مجموعة فارغة.',
		succession:
			'في الحساب الشخصي أنت وحدك من يمنح الصلاحية مجدداً؛ وفي منظمة Turso يستطيع أي مدير ذلك، وتستطيع Turso نقل المجموعة. لا يفعل rentable أياً منهما نيابة عنك.',
		groupAskedOnce:
			'المجموعة التي لا تحمل شيئاً بعد يطلب rentable اسمها مرة واحدة في الخطوة التالية، فـ Turso لا تذكر هذا الاسم في أي مكان يصل إليه.'
	}
} as const;

test('the connect step says these things, and says them in both locales', () => {
	for (const locale of ['en', 'ar'] as const) {
		const setup = { en, ar }[locale].organization.setup;

		for (const key of STATEMENT_KEYS) {
			assert.equal(setup[key], STATEMENTS[locale][key], `${locale}: ${key}`);
		}
	}

	// the connect step draws these and no others, in this order.
	assert.deepEqual(SETUP_WALK.find((step) => step.step === 'connect')?.statements, [
		...STATEMENT_KEYS
	]);
});

/**
 * Requirement 21 of the redesign: **one Turso group holds one organization**, so a first run
 * whose consent landed on a group that already holds one is refused before anything is created,
 * and the refusal gives the consent back. The walk has nowhere to go from the name step after
 * that, since the machine holds no authority to create with, so it returns to the consent
 * carrying the refusal's own sentence.
 *
 * The sentence itself is Rust's and is shown unchanged; the literal below is read back out of
 * `setup.rs` so the fixture cannot drift away from what the person is actually shown.
 */
const GROUP_ALREADY_HOLDS_ONE =
	'this group already holds the organization database `org-7f3a`; a group holds one organization, so pick another group or another Turso account';

test('the refusal a group already holding an organization gives is the sentence rust formats', async () => {
	const rust = await readFile(
		fileURLToPath(new URL('../../../../tauri/src/organization/setup.rs', import.meta.url)),
		'utf8'
	);
	// rust wraps a long literal with a trailing backslash and indents the next line; unwrapping
	// it is what lets the sentence be compared as the one string it is at runtime.
	const unwrapped = rust.replace(/\\\n\s*/g, '');

	assert.ok(
		unwrapped.includes(
			'a group holds one organization, so pick another group or another Turso account'
		),
		'rust no longer formats the sentence this file pins'
	);
	assert.ok(
		unwrapped.includes('this group already holds the organization database `{held}`'),
		'rust no longer names the database that is in the way'
	);
});

/**
 * Effort 826's correction to requirement 13: the group the person typed is what the first create
 * names, so a group that is not the one the consent is over is refused before anything is
 * created. **The refusal names both**, because the person is being asked to correct one word and
 * cannot do that without seeing what the other one is. The sentence is Rust's and is shown
 * unchanged, so it is read back out of `setup.rs` here the way the group-already-held one is.
 */
test('the refusal a group that is not the consented one gives names both groups, and rust formats it', async () => {
	const rust = await readFile(
		fileURLToPath(new URL('../../../../tauri/src/organization/setup.rs', import.meta.url)),
		'utf8'
	);
	const unwrapped = rust.replace(/\\\n\s*/g, '');

	assert.ok(
		unwrapped.includes('the group this consent is over is called `{}`, not `{typed_group}`'),
		'rust no longer names both the consented group and the typed one'
	);
});

// and a create refused over the group is an ordinary failed create as far as the walk is
// concerned: the authority is untouched, so the person stays on the name step and retypes it.
test('a create refused over the group leaves the walk on the step the group was typed on', () => {
	const refused = {
		code: 'preconditionFailed',
		message: 'the group this consent is over is called `rentable`, not `rentabel`'
	};

	assert.equal(refusalAfterFailedCreate(refused, true), null);
});

test('a create refused after the consent was given back sends the walk to the connect step', () => {
	const refused = { code: 'preconditionFailed', message: GROUP_ALREADY_HOLDS_ONE };

	// the authority is gone, because rust gave it back: the walk goes to the consent and says
	// why it is there.
	assert.deepEqual(refusalAfterFailedCreate(refused, false), {
		step: 'connect',
		message: GROUP_ALREADY_HOLDS_ONE,
		askGroup: false,
		detail: null
	});

	// and the step it lands on is the one that offers the consent, which is where the person
	// picks another group or another account.
	assert.deepEqual(SETUP_WALK[0]?.step, 'connect');
	assert.deepEqual(SETUP_WALK[0]?.fields, []);
});

/**
 * Requirement 13's second correction: Turso would take no group this application could work out,
 * so the one name left is the one the person picked. **The signal is the fixed phrase**, because
 * nothing else about that run is different: the consent is intact and the machine still holds
 * the authority, which is what every other refusal is told apart by. The phrase is Rust's, and
 * it is read back out of `setup.rs` so the constant here cannot drift away from what is thrown.
 */
test('the fixed phrase the walk reads is the one rust formats', async () => {
	const rust = await readFile(
		fileURLToPath(new URL('../../../../tauri/src/organization/setup.rs', import.meta.url)),
		'utf8'
	);

	assert.ok(
		rust.includes(`pub const THE_GROUP_IS_NEEDED: &str = "${THE_GROUP_IS_NEEDED}";`),
		'rust no longer declares the phrase this file matches on'
	);
});

test('a create refused because turso will take no group asks for one on the name step', () => {
	const refused = {
		code: 'preconditionFailed',
		message: `${THE_GROUP_IS_NEEDED}. turso refused every group this application could name on its own, and said: group \`default\` does not exist in this organization`
	};

	// the consent is untouched, so the machine still holds the authority and the walk stays
	// where it is: what changes is that the step now has a field on it, and Turso's own account
	// of why comes back beside it as detail rather than as the sentence the field leads with.
	assert.deepEqual(refusalAfterFailedCreate(refused, true), {
		step: 'name',
		message: refused.message,
		askGroup: true,
		detail:
			'turso refused every group this application could name on its own, and said: group `default` does not exist in this organization'
	});

	// and it is the phrase rather than the authority that decides, so a machine that somehow
	// lost the authority as well is still asked for the group rather than sent to the consent.
	assert.equal(refusalAfterFailedCreate(refused, false)?.askGroup, true);
});

/**
 * Requirement 13's fourth correction: what the field shows under its sentence is Turso's own
 * account, and the split that gets it is on the fixed phrase alone. **Everything after the
 * phrase is free to change**, Rust's framing and Turso's last reason inside it, so a split
 * that looked for the words around the reason would be reading a sentence nobody promised.
 */
test('the detail under the field is everything the refusal says after the fixed phrase', () => {
	// the punctuation between the two belongs to the phrase, so the detail starts a line.
	assert.equal(
		refusalAfterFailedCreate({ message: `${THE_GROUP_IS_NEEDED}. 404 group not found` }, true)
			?.detail,
		'404 group not found'
	);

	// a refusal that is the phrase and nothing else has no detail to show, and the field draws
	// none rather than an empty line under its sentence.
	assert.equal(refusalAfterFailedCreate({ message: THE_GROUP_IS_NEEDED }, true)?.detail, null);
	assert.equal(
		refusalAfterFailedCreate({ message: `${THE_GROUP_IS_NEEDED}.  ` }, true)?.detail,
		null
	);
});

test('an ordinary failed create leaves the walk where it is', () => {
	// the machine still holds the authority, so nothing was given back and the shared handler
	// has already said what went wrong; the name step keeps what was typed.
	assert.equal(refusalAfterFailedCreate(new Error('turso could not be reached'), true), null);
	assert.equal(refusalAfterFailedCreate({ code: 'network', message: 'no route' }, true), null);
});

/**
 * Requirement 13's second correction, the other half: **the walk hands an admitted machine over
 * rather than drawing it a step.** A reload during a first run, an address typed in, and the
 * moment after the first workspace is created all reach the route with a session on the state
 * query, and until this the walk read only whether that session held no workspace. One that held
 * a workspace fell through and the person was shown the consent step again, on a machine that
 * had finished the walk.
 */
test('where the walk goes for a machine that is already somebody', () => {
	// nobody is in: the walk draws whatever step it was on.
	assert.equal(stepFor(null), null);
	assert.equal(stepFor(undefined), null);

	// an owner is in and their organization holds nothing yet: the third step, whatever step the
	// route was opened at, since the first two would create the organization again.
	assert.equal(stepFor(fakeOrganizationSession({ workspaces: [] })), 'workspace');

	// and one who holds a workspace has finished: there is nothing left to ask, so they go home.
	assert.equal(stepFor(fakeOrganizationSession()), 'leave');
	assert.equal(
		stepFor(
			fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south' })
				]
			})
		),
		'leave'
	);
});

/**
 * THE VOCABULARY GUARD
 *
 * Two properties, and the first has not changed: **no word Turso wants is ever asked for or
 * said**. A slug, a token, a URL, a host and a secret are the application's business and never a
 * reader's, so none of them appears in a field name or in a sentence the walk shows.
 *
 * The second is what the group field made narrower. Nothing available to this application can
 * make a group, and on a Free or Developer account the person cannot make a second one either,
 * so an instruction to make one is an instruction that fails for most of the people who would
 * read it. The walk carried one until this effort. Since 2026-09-15 it does name a group,
 * because Turso's create refuses a request that names none and an empty group is a thing only
 * the person knows the name of, **so what is refused is the instruction rather than the word**.
 *
 * **An instruction puts its verb first, and that is the whole of the distinction.** "pick an
 * empty group" tells somebody to do something; "the group you chose" tells them which one is
 * meant. The connect statements keep the older, narrower reading of the same rule, because
 * requirement 13 has them say in so many words that an empty group is the one to pick on a paid
 * account: they may point at a group somebody already has to choose between, and they still may
 * not tell anybody to make one. The field is held to the wider reading, since it has no business
 * instructing anybody at all.
 *
 * A match is kept inside one sentence, which is what stops a statement that names a group in one
 * sentence and an account in the next from reading as an instruction about a group.
 *
 * **`groupAskedOnce` is a statement and is held to the statements' reading**, which is what lets
 * it say that a group holding nothing yet is asked its name: it describes the field the next
 * step may draw, and it tells nobody to make a group or to go and find one.
 */

/** every sentence the last-resort field shows, including the one that says why it is there. */
const GROUP_FIELD_KEYS = [
	'groupNeeded',
	'groupLabel',
	'groupDescription',
	'groupRequired'
] as const;

/**
 * What Turso wants and a reader never types.
 *
 * **`group` is back in this list and applies to the fields alone**, which is where it was until
 * requirement 13's first correction and where it is again: no step of the walk presents a group,
 * and the one field that ever asks for one is not a step's. The sentences are held to the wider
 * list below instead, because requirement 13 has the connect step say in so many words what a
 * group covers, and a guard that refused the word there would refuse the requirement.
 */
const TURSO_FIELD_VOCABULARY = /slug|group|token|url|host|secret/i;

/** the same list for a sentence, less the group, for the reason above. */
const TURSO_VOCABULARY = /slug|token|url|host|secret/i;

/** telling somebody to make a group, in either language: the verb, then the group. */
const MAKE_A_GROUP = {
	en: /\b(create|creating|make|making|add|adding|set up)\b[^.]{0,24}\bgroups?\b/i,
	ar: /(أنشئ|انشئ|إنشاء|انشاء|اصنع|كوّن)[^.]{0,24}مجموعة/
};

/** the wider reading the field is held to: making one, choosing one, or calling one empty. */
const ANY_GROUP_INSTRUCTION = {
	en: /\b(create|creating|make|making|add|adding|set up|pick|picking|choose|choosing|select|selecting)\b[^.]{0,24}\bgroups?\b|\bempty\b[^.]{0,12}\bgroups?\b/i,
	ar: /(أنشئ|انشئ|إنشاء|انشاء|اصنع|كوّن|اختر|اختيار|حدّد|حدد)[^.]{0,24}مجموعة|مجموعة[^.]{0,12}فارغة/
};

test('nothing the walk presents asks for a slug, a group, a token, a URL, a host or a secret', () => {
	for (const step of SETUP_WALK) {
		for (const field of step.fields) {
			assert.doesNotMatch(field, TURSO_FIELD_VOCABULARY, `the ${step.step} step asks for ${field}`);
		}
	}

	for (const locale of ['en', 'ar'] as const) {
		const setup = { en, ar }[locale].organization.setup;

		for (const key of [...STATEMENT_KEYS, ...GROUP_FIELD_KEYS]) {
			assert.doesNotMatch(setup[key], TURSO_VOCABULARY, `${locale}: ${key}`);
		}
	}
});

test('neither locale tells the owner to create a group', () => {
	for (const key of STATEMENT_KEYS) {
		assert.doesNotMatch(en.organization.setup[key], MAKE_A_GROUP.en, `en: ${key}`);
		assert.doesNotMatch(ar.organization.setup[key], MAKE_A_GROUP.ar, `ar: ${key}`);
	}

	// and the guard catches what the walk used to say, in both languages.
	assert.match(PARAGRAPHS_REPLACED[0]!, MAKE_A_GROUP.en);
	assert.match(AR_WAS, MAKE_A_GROUP.ar);
});

// requirement 13's second correction: the last-resort field names a group and instructs nobody
// about one, so the one place the walk can say the word gains back none of the sentence this
// effort removed.
test('the group field names a group without instructing anybody about one', () => {
	for (const locale of ['en', 'ar'] as const) {
		const setup = { en, ar }[locale].organization.setup;

		for (const key of GROUP_FIELD_KEYS) {
			assert.ok(setup[key].length > 0, `${locale}: ${key}`);
			assert.doesNotMatch(setup[key], ANY_GROUP_INSTRUCTION[locale], `${locale}: ${key}`);
		}

		// written in each language rather than copied from the other.
		assert.notEqual(
			ar.organization.setup[GROUP_FIELD_KEYS[0]],
			en.organization.setup[GROUP_FIELD_KEYS[0]]
		);
	}

	// and the wider reading still catches the instruction the walk retired, in both languages.
	assert.match(PARAGRAPHS_REPLACED[0]!, ANY_GROUP_INSTRUCTION.en);
	assert.match(AR_WAS, ANY_GROUP_INSTRUCTION.ar);
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
