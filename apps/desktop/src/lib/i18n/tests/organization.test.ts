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

// effort 826, requirement 15: a person who was invited and has not signed in yet is a row in the
// one members list, marked by a badge carrying the expiry. The list of pending accounts, its
// title and its empty sentence are gone with it; what is read here is that both locales carry
// the mark and the two expiry sentences in their own words, since the row is rendered in
// `organization/tests/members.svelte.test.ts` and the words are what a reader meets.
test('both locales mark a pending member and say when their link runs out', () => {
	assert.match(en.organization.dashboard.notYetSignedIn, /^not yet signed in$/);
	assert.match(en.organization.dashboard.invitationExpires, /\{date:string\}/);
	assert.match(en.organization.dashboard.invitationLapsed, /\{date:string\}/);
	assert.match(ar.organization.dashboard.invitationExpires, /\{date\}/);
	assert.match(ar.organization.dashboard.invitationLapsed, /\{date\}/);
	assert.notEqual(
		ar.organization.dashboard.notYetSignedIn,
		en.organization.dashboard.notYetSignedIn
	);
	assert.notEqual(
		ar.organization.dashboard.invitationExpires,
		ar.organization.dashboard.invitationLapsed
	);
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
	assert.match(en.organization.dashboard.inviteDescription, /username/);
	assert.match(ar.organization.dashboard.inviteDescription, /اسم المستخدم/);
});

// effort 826, requirement 21: one Turso group holds one organization, and the connect step says
// so before the consent rather than leaving it to the refusal. Written in each language rather
// than translated word for word, and each says the rule and what happens to a group that
// already holds one.
test('both locales say a group holds one organization, and what that means for one that does', () => {
	assert.match(en.organization.setup.oneOrganization, /a group holds one organization/);
	assert.match(en.organization.setup.oneOrganization, /already holds one is refused/);
	assert.match(ar.organization.setup.oneOrganization, /مؤسسة واحدة/);
	assert.match(ar.organization.setup.oneOrganization, /تُرفض/);
	assert.notEqual(ar.organization.setup.oneOrganization, en.organization.setup.oneOrganization);
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
	'settingsHooks.startupRecoveryCleared'
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
	['organization link', 'organization.dashboard.linkTitle'],
	['invitation link', 'organization.dashboard.invitationLinkTitle'],
	['full access', 'organization.dashboard.accessFull'],
	['read only', 'organization.dashboard.accessReadOnly'],
	['you', 'settings.section.you'],
	['members', 'settings.section.members'],
	['workspaces', 'settings.section.workspaces']
] as const;

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

test('the turso account is the only thing the organization strings call an account', () => {
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
