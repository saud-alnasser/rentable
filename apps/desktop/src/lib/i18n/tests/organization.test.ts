import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';

// forgetting the turso account is the only place this application gives Turso authority back,
// and the token it forgets has no expiry to wait out. Forgetting it here revokes nothing: Turso's
// authorization server metadata advertises no revocation endpoint, so what the owner granted
// stays granted until the owner ends it on Turso's own dashboard. A screen that says "forgotten"
// and stops there tells somebody they are safe when they are not, which is why the pointer is
// pinned by a test rather than left to whoever writes the surface.

const locales = [
	['english', en],
	['arabic', ar]
] as const;

/** every leaf of a translation tree, keyed by its dotted path. */
function leaves(tree: object, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};

	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (value && typeof value === 'object') {
			Object.assign(out, leaves(value, path));
		} else {
			out[path] = String(value);
		}
	}

	return out;
}

/** the value at a dotted path, or `undefined` where no key holds it. */
function at(tree: object, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(node, key) => (node && typeof node === 'object' ? Reflect.get(node, key) : undefined),
			tree
		);
}

test('both locales offer forgetting the turso account and describe what it forgets', () => {
	for (const [name, translation] of locales) {
		const { forgetAccount, forgetAccountDescription, accountForgotten } =
			translation.organization.dashboard;

		assert.equal(typeof forgetAccount, 'string', `${name} is missing the action`);
		assert.ok(forgetAccount.length > 0, `${name} offers an empty action`);
		assert.ok(
			forgetAccountDescription.length > 0,
			`${name} says nothing about what forgetting does`
		);
		assert.ok(accountForgotten.length > 0, `${name} says nothing once the token is gone`);
	}
});

test('both locales say the token is not revoked and name where it is', () => {
	for (const [name, translation] of locales) {
		const { forgetAccountRevokes, forgetAccountRevokesAt } = translation.organization.dashboard;

		assert.ok(
			forgetAccountRevokes.includes(forgetAccountRevokesAt),
			`${name} does not name where turso revokes the token: ${forgetAccountRevokes}`
		);
		assert.equal(
			forgetAccountRevokesAt,
			'app.turso.tech',
			`${name} points somewhere other than turso's own dashboard`
		);
	}
});

test('neither locale tells somebody that forgetting revoked anything', () => {
	// each locale's own word for revoking, so the claim is checked against a reader of that
	// language rather than against a reader of english twice.
	const revoking = [
		['english', en.organization.dashboard.accountForgotten, 'revok'],
		['arabic', ar.organization.dashboard.accountForgotten, 'يلغي']
	] as const;

	for (const [name, confirmation, word] of revoking) {
		assert.ok(
			!confirmation.includes(word),
			`${name} reports the grant as revoked when only this machine forgot it: ${confirmation}`
		);
	}
});

// effort 828, requirement 19: a card carries one line of standing, and the three lines are two
// facts about the account read as sentences. They gate nothing. What is read here is that both
// locales carry all three in their own words and tell them apart; the card itself is rendered in
// `organization/tests/members.svelte.test.ts`. *Both locales marked a pending member and dated
// their link until the cards replaced the rows; the standing says the same thing about the
// account rather than about an invitation.*
test('both locales say where an account stands, in three lines that differ', () => {
	const lines = [
		['english', en.organization.dashboard],
		['arabic', ar.organization.dashboard]
	] as const;

	for (const [name, dashboard] of lines) {
		const said = [
			dashboard.standingNoPassword,
			dashboard.standingNoMachine,
			dashboard.standingSignedIn
		];

		assert.equal(new Set(said).size, 3, `${name} says two standings with one sentence`);

		for (const line of said) {
			assert.ok(line.length > 0, `${name} leaves a standing unsaid`);
		}
	}

	assert.match(en.organization.dashboard.standingNoPassword, /^no password yet$/);
	assert.notEqual(
		ar.organization.dashboard.standingSignedIn,
		en.organization.dashboard.standingSignedIn
	);
	// the link a handover dates is still dated, in both locales: it is the one place the sentence
	// is read now.
	assert.match(en.organization.dashboard.invitationExpires, /\{date:string\}/);
	assert.match(ar.organization.dashboard.invitationExpires, /\{date\}/);
});

// effort 826, requirements 5 and 6: the two refusals the spec keeps in words rather than in a
// hidden control each name the owner, in both languages.
test('both locales name the owner where an act belongs to nobody else', () => {
	for (const [name, translation] of locales) {
		assert.ok(
			translation.organization.dashboard.signingIsTheOwners.length > 0,
			`${name} says nothing about who may hand out a signing act`
		);
		assert.ok(
			translation.organization.dashboard.readOnlyIsTheOwners.length > 0,
			`${name} says nothing about who may grant read only`
		);
	}

	assert.match(en.organization.dashboard.signingIsTheOwners, /only the owner/);
	assert.match(en.organization.dashboard.readOnlyIsTheOwners, /only the owner/);
	assert.match(ar.organization.dashboard.signingIsTheOwners, /المالك وحده/);
	assert.match(ar.organization.dashboard.readOnlyIsTheOwners, /المالك وحده/);
});

// effort 826, requirement 8: what an invitation shows afterwards is one link, and the sentence
// that nothing was sent names the link and no password, in both locales.
test('both locales say the link is handed over by hand, and neither mentions a password', () => {
	assert.match(en.organization.dashboard.cannotSend, /copy the link below/);
	assert.doesNotMatch(en.organization.dashboard.cannotSend, /the password/);
	assert.match(ar.organization.dashboard.cannotSend, /انسخ الرابط أدناه/);
	assert.doesNotMatch(ar.organization.dashboard.cannotSend, /كلمة المرور أدناه/);
	assert.match(en.organization.dashboard.memberDescription, /username/);
	assert.match(ar.organization.dashboard.memberDescription, /اسم المستخدم/);
});

// effort 826, requirement 21: one Turso group holds one organization, and the connect step says
// so before the consent rather than leaving it to the refusal. Written in each language rather
// than translated word for word, and each says the rule and what happens to a group that
// already holds one. *Effort 828, requirement 14: what happens to one that does is that this
// machine is connected to what is there, so the sentence no longer says it is refused.*
test('both locales say a group holds one organization, and what that means for one that does', () => {
	assert.match(en.organization.setup.oneOrganization, /a group holds one organization/);
	assert.match(en.organization.setup.oneOrganization, /already holds one is connected to/);
	assert.doesNotMatch(en.organization.setup.oneOrganization, /already holds one is refused/);
	assert.match(ar.organization.setup.oneOrganization, /مؤسسة واحدة/);
	assert.match(ar.organization.setup.oneOrganization, /الاتصال بها/);
	assert.notEqual(ar.organization.setup.oneOrganization, en.organization.setup.oneOrganization);
});

// effort 826, requirement 13's fourth correction: the one group the application cannot name on
// its own is one holding nothing yet, and the connect step says so before the consent rather
// than leaving the field on the next step to be the first news of it. Each locale says that the
// name is asked once, and where.
test('both locales say a group holding nothing yet is asked its name once, on the next step', () => {
	assert.match(en.organization.setup.groupAskedOnce, /holding nothing yet/);
	assert.match(en.organization.setup.groupAskedOnce, /once/);
	assert.match(en.organization.setup.groupAskedOnce, /next step/);
	assert.match(ar.organization.setup.groupAskedOnce, /مرة واحدة/);
	assert.match(ar.organization.setup.groupAskedOnce, /الخطوة التالية/);
	assert.notEqual(ar.organization.setup.groupAskedOnce, en.organization.setup.groupAskedOnce);
});

// the same correction, on the field itself: the sentence over it is what to type rather than
// what went wrong, and the description under it is where the name reads.
test('both locales ask for the group as a step, and say where its name is read', () => {
	assert.match(en.organization.setup.groupNeeded, /type its name here once/);
	assert.match(en.organization.setup.groupDescription, /consent screen/);
	assert.match(ar.organization.setup.groupNeeded, /مرة واحدة/);
	assert.match(ar.organization.setup.groupDescription, /شاشة موافقة Turso/);
	assert.notEqual(ar.organization.setup.groupNeeded, en.organization.setup.groupNeeded);
	assert.notEqual(ar.organization.setup.groupDescription, en.organization.setup.groupDescription);
});

// effort 826, requirement 18: the pages this effort retired read strings of their own, and the
// strings went with the pages. Each is named here so that a key coming back under its old name
// is caught by the test rather than by a reader meeting a sentence about a screen that is gone.
const RETIRED = [
	// the account page and the forced password change
	'account',
	'layout.changePassword',
	'layout.accountMenu.label',
	'common.nav.organization',
	// the control plane's leftovers
	'layout.startup.accountChoiceEmpty',
	'organization.disconnectAction',
	'organization.disconnectDescription',
	'organization.disconnectRevokes',
	'organization.disconnectRevokesAt',
	'organization.disconnected',
	'organization.setup.setupTitle',
	'organization.setup.setupDescription',
	// the pending accounts list and the handed password
	'organization.dashboard.pendingAccounts',
	'organization.dashboard.noPendingAccounts',
	'organization.dashboard.generatedPassword',
	'organization.dashboard.passwordOnce',
	'organization.dashboard.copyPassword',
	'organization.dashboard.passwordCopied',
	'organization.dashboard.copyUsername',
	'organization.dashboard.usernameCopied',
	'organization.dashboard.resetPassword',
	'organization.dashboard.standingOpen',
	'organization.dashboard.standingConsumed',
	// the workspace page's identity and members blocks
	'workspace.groupIdentity',
	'workspace.groupMembers',
	'workspace.groupSync',
	'workspace.groupTransfer',
	'workspace.identityDescription',
	'workspace.membersDescription',
	'workspace.roleOwner',
	'workspace.title',
	// the settings page before it was sectioned
	'settings.accountDescription',
	'settings.aboutTitle',
	'settings.createdAt',
	'settings.groupGeneral',
	'settings.groupUpdates',
	'settings.groupDiagnostics',
	'settings.openWorkspaceAction',
	'settings.usingCustomDatabasePath',
	'settings.usingDefaultDatabasePath',
	'settingsHooks.profileSwitched',
	'settingsHooks.startupRecoveryCleared',
	// the three sections that were folded into the four, and the two words two of them went by
	// (requirement 24 of effort 828). The names are gone from the rail; the addresses still open
	// the section that holds what they held, which `section.test.ts` reads.
	'settings.section.you',
	'settings.section.members',
	'settings.section.sync',
	'settings.section.updates',
	'settings.section.diagnostics'
] as const;

test('both locales have let go of every string the retired pages read', () => {
	for (const [name, translation] of locales) {
		for (const key of RETIRED) {
			assert.equal(at(translation, key), undefined, `${name} still carries ${key}`);
		}
	}
});

// requirement 18, the other half: one name per thing. Each term the requirement names is one
// english key, spelled the same wherever a screen draws it, and its arabic is written rather
// than left in english; and the words the requirement retires are in no english sentence.
const TERMS = [
	['sign in', 'common.actions.signIn'],
	['sign out', 'common.actions.signOut'],
	['connect turso account', 'organization.setup.connect'],
	['forget turso account', 'organization.dashboard.forgetAccount'],
	['link and code', 'organization.dashboard.linkTitle'],
	['full access', 'organization.dashboard.accessFull'],
	['read only', 'organization.dashboard.accessReadOnly'],
	['members', 'organization.dashboard.membersTitle'],
	['workspaces', 'settings.section.workspaces']
] as const;

// requirement 24 of effort 828: the area's four sections, each named for what it holds, in both
// locales. The names themselves are read here; which blocks sit under each is `area.svelte.test.ts`.
const SECTIONS = ['general', 'account', 'organization', 'workspaces'] as const;

test('both locales name the four sections of the settings area', () => {
	for (const [name, translation] of locales) {
		const section = at(translation, 'settings.section');

		assert.deepEqual(Object.keys(section as object), [...SECTIONS], `${name} names other sections`);

		for (const key of SECTIONS) {
			assert.ok((section as Record<string, unknown>)[key], `${name} has no name for ${key}`);
		}
	}

	// and the arabic is written rather than left in english.
	for (const key of SECTIONS) {
		assert.notEqual(at(ar, `settings.section.${key}`), at(en, `settings.section.${key}`));
	}
});

const RETIRED_WORDS = ['pending account', 'unlock your place', 'control plane', 'log in', 'login'];

test('each term of requirement 18 is one english key, and its arabic is written', () => {
	const english = leaves(en);

	for (const [term, key] of TERMS) {
		assert.equal(english[key], term, `${key} does not read "${term}"`);

		const holders = Object.entries(english)
			.filter(([, value]) => value === term)
			.map(([path]) => path);

		assert.deepEqual(holders, [key], `"${term}" is held by more than one key`);
		assert.notEqual(at(ar, key), term, `${key} is not written in arabic`);
	}

	for (const [key, value] of Object.entries(english)) {
		for (const word of RETIRED_WORDS) {
			assert.ok(!value.toLowerCase().includes(word), `${key} still says "${word}": ${value}`);
		}
	}
});

// requirement 18 of effort 826, with the one exception requirement 24 of effort 828 made:
// `settings.section.account` names the reader's own section of the settings area, because that is
// what the human chose to call the place their username, their password and their machines are
// kept. It is outside the key prefixes this test reads, and that is deliberate rather than an
// oversight: every other thing a reader meets that is called an account is the Turso account.
test('the turso account is the only thing the organization strings call an account, settings.section aside', () => {
	const english = leaves(en);

	for (const [key, value] of Object.entries(english)) {
		if (!/^(organization|workspace|layout\.signIn|settings\.you)\./.test(key)) continue;
		if (!/\baccount\b/.test(value)) continue;

		assert.match(
			value,
			/turso/,
			`${key} calls something other than the turso account an account: ${value}`
		);
	}

	// and read only is spelled one way wherever an organization string says it.
	for (const [key, value] of Object.entries(english)) {
		if (!key.startsWith('organization.')) continue;

		assert.doesNotMatch(value, /read-only/, `${key} spells read only with a hyphen`);
	}
});
