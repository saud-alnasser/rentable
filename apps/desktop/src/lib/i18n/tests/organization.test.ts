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

// requirement 25 of effort 824: the organization page names what it is for. The invitations
// section is titled as pending accounts, since an account is made at invite and pending until
// its first sign-in; the page is a route, which no runner here renders, so the title is read
// here. The link section's sentence is read on the rendered section in
// `organization/tests/organization-link.svelte.test.ts`.
test('both locales title the invitations section as pending accounts, written rather than copied', () => {
	assert.match(en.organization.dashboard.pendingAccounts, /^pending accounts$/);
	assert.match(ar.organization.dashboard.pendingAccounts, /الحسابات المعلّقة/);
	assert.notEqual(
		ar.organization.dashboard.pendingAccounts,
		en.organization.dashboard.pendingAccounts
	);
	assert.match(en.organization.dashboard.noPendingAccounts, /pending accounts/);
	assert.match(ar.organization.dashboard.noPendingAccounts, /حسابات معلّقة/);
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
