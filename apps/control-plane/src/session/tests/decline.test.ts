import assert from 'node:assert/strict';
import test from 'node:test';

import { freshDatabase, SOMEBODY } from '../../tests/testing.ts';
import { signInWithGoogle } from '../../account/account.ts';
import { declineRenewalForEmail } from '../decline.ts';
import { resumeSession, startSession } from '../session.ts';
import { Refusal } from '../../failure.ts';

const AT = Date.UTC(2026, 7, 19, 12, 0, 0);

const withDatabase = async (
	run: (db: Awaited<ReturnType<typeof freshDatabase>>['db']) => Promise<void>
) => {
	const { db, close } = await freshDatabase();

	try {
		await run(db);
	} finally {
		await close();
	}
};

/**
 * Two people on one address, which is the case `account.email` has no unique index for.
 *
 * They differ by Google subject, because that is what makes them two people: an address freed and
 * reassigned reaches this control plane as a different `sub`, and matching on the address would
 * have made them one row.
 */
const twoPeopleSharingAnAddress = async (
	db: Awaited<ReturnType<typeof freshDatabase>>['db'],
	email: string
) => [
	await signInWithGoogle(db, { ...SOMEBODY, subject: 'google-subject-departed', email }, AT),
	await signInWithGoogle(db, { ...SOMEBODY, subject: 'google-subject-replacement', email }, AT)
];

test('declining by email ends every session that account holds, and answers how many', async () => {
	await withDatabase(async (db) => {
		const account = await signInWithGoogle(db, SOMEBODY, AT);
		const laptop = await startSession(db, account.id, AT);
		await startSession(db, account.id, AT);

		const result = await declineRenewalForEmail(db, SOMEBODY.email);

		assert.deepEqual(result, {
			outcome: 'declined',
			accountId: account.id,
			email: SOMEBODY.email,
			ended: 2
		});

		await assert.rejects(() => resumeSession(db, laptop.token, AT + 1), Refusal);
	});
});

// The count is what tells the operator which of the two happened, and criterion 19 asks for
// exactly that distinction. An account with nothing live is still declined: the answer is zero.
test('an account with no live session is declined all the same, and says so with a zero', async () => {
	await withDatabase(async (db) => {
		const account = await signInWithGoogle(db, SOMEBODY, AT);

		assert.deepEqual(await declineRenewalForEmail(db, SOMEBODY.email), {
			outcome: 'declined',
			accountId: account.id,
			email: SOMEBODY.email,
			ended: 0
		});
	});
});

test('no other account loses a session', async () => {
	await withDatabase(async (db) => {
		const declined = await signInWithGoogle(db, SOMEBODY, AT);
		const bystander = await signInWithGoogle(
			db,
			{ ...SOMEBODY, subject: 'google-subject-2', email: 'someone-else@example.com' },
			AT
		);
		await startSession(db, declined.id, AT);
		const kept = await startSession(db, bystander.id, AT);

		await declineRenewalForEmail(db, SOMEBODY.email);

		assert.ok(
			await resumeSession(db, kept.token, AT + 1),
			'declining for one account took another account down with it'
		);
	});
});

/**
 * **The refusal is the point of naming an account by its address**, and the reason the address is
 * not allowed to be an identity. Acting on both would end a stranger's sessions and answer with a
 * `2` that reads exactly like success.
 */
test('an address naming two accounts is refused, and neither is touched', async () => {
	await withDatabase(async (db) => {
		const shared = 'reassigned@example.com';
		const [departed, replacement] = await twoPeopleSharingAnAddress(db, shared);
		assert.ok(departed && replacement);
		const stillGood = await startSession(db, replacement.id, AT);

		const result = await declineRenewalForEmail(db, shared);

		assert.equal(result.outcome, 'ambiguous');
		assert.deepEqual(
			result.outcome === 'ambiguous' ? result.accountIds : [],
			[departed.id, replacement.id].sort(),
			'the refusal did not name the accounts an operator has to choose between'
		);
		assert.ok(
			await resumeSession(db, stillGood.token, AT + 1),
			'a refusal that ended a session anyway is not a refusal'
		);
	});
});

test('an address nobody here holds is refused rather than reported as a decline of nothing', async () => {
	await withDatabase(async (db) => {
		await signInWithGoogle(db, SOMEBODY, AT);

		assert.deepEqual(await declineRenewalForEmail(db, 'nobody@example.com'), {
			outcome: 'no-such-account',
			email: 'nobody@example.com'
		});
	});
});

// The operator is typing rather than copying an id, and SQLite compares TEXT case-sensitively.
// Without this a shift key reads back as "no account here has that address", which is the one
// answer that would send somebody looking for a bug in the wrong place.
test('the address is matched without regard to case or surrounding space', async () => {
	await withDatabase(async (db) => {
		const account = await signInWithGoogle(db, SOMEBODY, AT);

		const result = await declineRenewalForEmail(db, `  ${SOMEBODY.email.toUpperCase()}  `);

		assert.equal(result.outcome, 'declined');
		assert.equal(result.outcome === 'declined' ? result.accountId : null, account.id);
	});
});
