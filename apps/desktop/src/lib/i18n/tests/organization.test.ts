import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';

// the disconnect is the only place this application gives Turso authority back, and the token
// it forgets has no expiry to wait out. Forgetting it here revokes nothing: Turso's
// authorization server metadata advertises no revocation endpoint, so what the owner granted
// stays granted until the owner ends it on Turso's own dashboard. A screen that says
// "disconnected" and stops there tells somebody they are safe when they are not, which is why
// the pointer is pinned by a test rather than left to whoever writes the surface.

const locales = [
	['english', en],
	['arabic', ar]
] as const;

test('both locales offer the disconnect and describe what it forgets', () => {
	for (const [name, translation] of locales) {
		assert.equal(
			typeof translation.organization.disconnectAction,
			'string',
			`${name} is missing the action`
		);
		assert.ok(
			translation.organization.disconnectAction.length > 0,
			`${name} offers an empty action`
		);
		assert.ok(
			translation.organization.disconnectDescription.length > 0,
			`${name} says nothing about what disconnecting does`
		);
		assert.ok(
			translation.organization.disconnected.length > 0,
			`${name} says nothing once the token is gone`
		);
	}
});

test('both locales say the token is not revoked and name where it is', () => {
	for (const [name, translation] of locales) {
		const { disconnectRevokes, disconnectRevokesAt } = translation.organization;

		assert.ok(
			disconnectRevokes.includes(disconnectRevokesAt),
			`${name} does not name where turso revokes the token: ${disconnectRevokes}`
		);
		assert.equal(
			disconnectRevokesAt,
			'app.turso.tech',
			`${name} points somewhere other than turso's own dashboard`
		);
	}
});

test('neither locale tells somebody the disconnect revoked anything', () => {
	// each locale's own word for revoking, so the claim is checked against a reader of that
	// language rather than against a reader of english twice.
	const revoking = [
		['english', en.organization.disconnected, 'revok'],
		['arabic', ar.organization.disconnected, 'يلغي']
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
