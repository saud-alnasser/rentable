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
