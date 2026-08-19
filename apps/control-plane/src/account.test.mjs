import assert from 'node:assert/strict';
import test from 'node:test';

import { signInWithGoogle } from './account.ts';
import { freshDatabase, SOMEBODY } from './testing.mjs';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

test('signing in the first time makes the account', async () => {
	const { db, close } = await freshDatabase();

	try {
		const created = await signInWithGoogle(db, SOMEBODY, AT);

		assert.equal(created.email, SOMEBODY.email);
		assert.equal(created.displayName, SOMEBODY.displayName);
		assert.equal(created.avatarUrl, SOMEBODY.avatarUrl);
		assert.equal(created.googleUserId, SOMEBODY.subject);
		assert.equal(created.createdAt.getTime(), AT);
		assert.equal(created.updatedAt.getTime(), AT);
		assert.ok(created.id, 'the account was given no identity');
	} finally {
		await close();
	}
});

// Acceptance criterion 2, and the whole of why `googleUserId` is the column matched on.
test('the same person signing in twice reaches the same account', async () => {
	const { db, close } = await freshDatabase();

	try {
		const first = await signInWithGoogle(db, SOMEBODY, AT);
		const second = await signInWithGoogle(db, SOMEBODY, AT + 1000);

		assert.equal(second.id, first.id);
		assert.equal(second.createdAt.getTime(), AT, 'the account was remade rather than found');
		assert.equal(second.updatedAt.getTime(), AT + 1000);
	} finally {
		await close();
	}
});

test('an email that changed does not make a second account', async () => {
	const { db, close } = await freshDatabase();

	try {
		const before = await signInWithGoogle(db, SOMEBODY, AT);
		const after = await signInWithGoogle(
			db,
			{ ...SOMEBODY, email: 'amal.nasser@example.com', displayName: 'Amal N.' },
			AT + 1000
		);

		assert.equal(after.id, before.id);
		assert.equal(after.email, 'amal.nasser@example.com', 'the profile went stale');
		assert.equal(after.displayName, 'Amal N.');
	} finally {
		await close();
	}
});

// The case a unique index on the email would have refused: a workspace domain gives a departed
// employee's address to their replacement, who is a different Google subject and a different
// person. Their first sign-in must work.
test('an address reassigned to somebody else is a second account, not a refused sign-in', async () => {
	const { db, close } = await freshDatabase();

	try {
		const departed = await signInWithGoogle(db, SOMEBODY, AT);
		const replacement = await signInWithGoogle(
			db,
			{ ...SOMEBODY, subject: 'google-subject-2', displayName: 'Noura Saleh' },
			AT + 1000
		);

		assert.notEqual(replacement.id, departed.id);
		assert.equal(replacement.email, departed.email, 'they hold the same address');
	} finally {
		await close();
	}
});

// Two first sign-ins for one person arriving together. A read followed by a write loses this:
// both find nothing, both insert, and the second is refused by the unique index — somebody's
// very first sign-in failing because they were quick.
test('two first sign-ins at once make one account, not a collision', async () => {
	const { db, close } = await freshDatabase();

	try {
		const [one, other] = await Promise.all([
			signInWithGoogle(db, SOMEBODY, AT),
			signInWithGoogle(db, SOMEBODY, AT)
		]);

		assert.equal(one.id, other.id);
	} finally {
		await close();
	}
});

test('two people are two accounts', async () => {
	const { db, close } = await freshDatabase();

	try {
		const one = await signInWithGoogle(db, SOMEBODY, AT);
		const other = await signInWithGoogle(
			db,
			{ ...SOMEBODY, subject: 'google-subject-2', email: 'noura@example.com' },
			AT
		);

		assert.notEqual(other.id, one.id);
	} finally {
		await close();
	}
});
