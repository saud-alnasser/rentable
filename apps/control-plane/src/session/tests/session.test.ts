import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import { Refusal, SESSION_EXPIRED, SESSION_LIFETIME_REACHED } from '../../failure.ts';
import { freshDatabase, SOMEBODY } from '../../tests/testing.ts';
import { signInWithGoogle } from '../../account/account.ts';
import { session } from '../../database/schema.ts';
import {
	declineRenewal,
	forgetExpiredSessions,
	looksLikeSessionToken,
	resumeSession,
	SESSION_ABSOLUTE_LIFETIME_MS,
	SESSION_LIFETIME_MS,
	startSession
} from '../session.ts';
import { TOKEN_LIFETIME } from '../../workspace/workspace.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);
const A_DAY = 24 * 60 * 60 * 1000;

/**
 * The clock is an argument everywhere below, which is the whole reason these run: requirement 15
 * is about three days passing, and no test is going to wait for them.
 */
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

const anAccount = async (db: Awaited<ReturnType<typeof freshDatabase>>['db'], now = AT) =>
	await signInWithGoogle(db, SOMEBODY, now);

// The lengths, and only the lengths. **This is not the guard against the two windows drifting**
// — they are started by different calls, so equal lengths were never what was at risk. The guard
// is that the mint restarts both in one answer (`../../server/tests/server.test.ts`) and that a
// client believes the earlier of the two numbers it holds
// (`apps/desktop/src/lib/sync/tests/session.test.ts`). What this pins is narrower and still
// worth pinning: a change to one number that forgot the other.
test('the two windows are the same length, which is the least of what they owe each other', () => {
	assert.equal(SESSION_LIFETIME_MS, 3 * A_DAY);
	assert.equal(TOKEN_LIFETIME, '3d', 'one window was retuned and the other was left behind');
});

test('a session is issued with the window on it, and the client is told when it ends', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		assert.ok(
			looksLikeSessionToken(issued.token),
			'a session token is not tellable from a google one'
		);
		assert.equal(issued.expiresAt, AT + 3 * A_DAY);
	});
});

// The credential half of the same row. What is stored answers "was this issued" and nothing else.
test('the token itself is not written down', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);
		const [stored] = await db.select().from(session).where(eq(session.accountId, account.id));

		assert.ok(stored);
		assert.notEqual(stored.tokenDigest, issued.token);
		assert.equal(stored.tokenDigest.length, 64, 'that is not a sha-256 digest');
	});
});

// Acceptance criterion 16, the half that must not ask: a reach inside the window renews, and the
// window restarts from the renewal rather than from the sign-in.
test('a reach inside the window restarts the window from the reach', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		const almostOut = AT + 3 * A_DAY - 1;
		const renewed = await resumeSession(db, issued.token, almostOut);

		assert.equal(renewed.account.id, account.id);
		assert.equal(renewed.session.token, issued.token, 'renewing handed back a different token');
		assert.equal(renewed.session.expiresAt, almostOut + 3 * A_DAY);

		// and the proof that it is the window and not the sign-in that moved: the same token is
		// still good three days after the *renewal*, which is six days after the sign-in.
		const later = await resumeSession(db, issued.token, almostOut + 3 * A_DAY - 1);
		assert.equal(later.account.id, account.id);
	});
});

// Acceptance criterion 16, the half that must ask.
// **This asserted the opposite until 2026-08-19.** It read *a session nobody reached for three
// days is refused, and the refusal names the action*, which was right while three days was the
// only window. Requirement 15 replaced it: past three days the *client* locks itself, and when a
// network returns it presents the same token and refreshes with nobody typing anything. A build
// that refused here would make every reconnection a Google sign-in, which acceptance criterion 16
// names as the likeliest way to get this wrong.
test('a session nobody reached for three days still refreshes, and nobody types anything', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		const resumed = await resumeSession(db, issued.token, AT + 4 * A_DAY);

		assert.equal(resumed.session.token, issued.token, 'the client was made to sign in again');
		assert.equal(
			resumed.session.expiresAt,
			AT + 4 * A_DAY + SESSION_LIFETIME_MS,
			'the refresh window did not restart from the reach'
		);
		assert.equal(
			resumed.session.absoluteExpiresAt,
			issued.absoluteExpiresAt,
			'the reach moved the absolute lifetime'
		);
	});
});

// The other half of criterion 16, and the one this ticket exists for: reaching faithfully does
// not buy a longer sign-in. A renewal that touched `absolute_expires_at` would pass every other
// test in this file and fail only this one.
test('reaching every day does not carry the sign-in past its month', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		for (let day = 1; day * A_DAY < SESSION_ABSOLUTE_LIFETIME_MS; day += 1) {
			const resumed = await resumeSession(db, issued.token, AT + day * A_DAY);
			assert.equal(resumed.session.absoluteExpiresAt, issued.absoluteExpiresAt);
		}

		const refusal = await resumeSession(db, issued.token, AT + SESSION_ABSOLUTE_LIFETIME_MS).then(
			() => null,
			(error: unknown) => error
		);

		assert.ok(refusal instanceof Refusal, 'a month of daily reaches slid the window past a month');
		assert.equal(refusal.code, SESSION_LIFETIME_REACHED);
		assert.equal(refusal.status, 401);
		assert.match(refusal.message, /sign in with google again/);
	});
});

// The two refusals ask different things of the person — reconnect, or go back to Google — so a
// client that could not tell them apart would either wait for a network that will not help, or
// throw somebody back to Google after a long weekend.
test('a sign-in that reached its month is refused by a different code than an unknown token', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		const aged = await resumeSession(db, issued.token, AT + SESSION_ABSOLUTE_LIFETIME_MS).then(
			() => null,
			(error: unknown) => error
		);
		const unknown = await resumeSession(db, 'rws_never-issued', AT).then(
			() => null,
			(error: unknown) => error
		);

		assert.ok(aged instanceof Refusal && unknown instanceof Refusal);
		assert.equal(aged.code, SESSION_LIFETIME_REACHED);
		assert.equal(unknown.code, SESSION_EXPIRED);
	});
});

// The boundary itself, because a month is where an off-by-one costs somebody a working sign-in.
test('the last millisecond of the lifetime is inside it and the first one after is not', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const inside = await startSession(db, account.id, AT);
		const outside = await startSession(db, account.id, AT);

		await resumeSession(db, inside.token, AT + SESSION_ABSOLUTE_LIFETIME_MS - 1);

		await assert.rejects(
			() => resumeSession(db, outside.token, AT + SESSION_ABSOLUTE_LIFETIME_MS),
			Refusal
		);
	});
});

// The refresh window may not be issued past the sign-in that carries it: the client locks itself
// on this number, so one reaching past the absolute lifetime would have it working after its
// sign-in had died, and then refused with no warning.
test('a refresh window is never issued past the absolute lifetime', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		const late = await resumeSession(db, issued.token, AT + SESSION_ABSOLUTE_LIFETIME_MS - A_DAY);

		assert.equal(late.session.expiresAt, issued.absoluteExpiresAt);
	});
});

test('a token this control plane never issued is refused the same way as an expired one', async () => {
	await withDatabase(async (db) => {
		const refusal = await resumeSession(db, 'rws_never-issued', AT).then(
			() => null,
			(error: unknown) => error
		);

		assert.ok(refusal instanceof Refusal);
		assert.equal(refusal.code, SESSION_EXPIRED, 'the refusal says which of the two it was');
	});
});

// Removing somebody, as this repository can actually do it: per account, at the next reach.
test('declining to renew ends the session at the next reach and not before', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const issued = await startSession(db, account.id, AT);

		assert.equal(await declineRenewal(db, account.id), 1);

		await assert.rejects(() => resumeSession(db, issued.token, AT + 1), Refusal);
	});
});

// The sweep keys on the absolute lifetime, not the refresh window. Removing a row three days past
// its last reach would take away the silent reconnection requirement 15 asks for: the session
// would be gone before the client that could still have used it came back online.
test('a sign-in past its month is removable, and one merely out of contact is left alone', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const aged = await startSession(db, account.id, AT);
		const quiet = await startSession(db, account.id, AT + A_DAY);
		// the third case, added with #607: a sign-in from this morning. It was implied by the two
		// above and never stated, which criterion 20 enumerates separately for a reason.
		const live = await startSession(db, account.id, AT + SESSION_ABSOLUTE_LIFETIME_MS - A_DAY);

		assert.equal(await forgetExpiredSessions(db, AT + SESSION_ABSOLUTE_LIFETIME_MS), 1);

		await assert.rejects(
			() => resumeSession(db, aged.token, AT + SESSION_ABSOLUTE_LIFETIME_MS),
			Refusal
		);
		assert.ok(
			await resumeSession(db, quiet.token, AT + SESSION_ABSOLUTE_LIFETIME_MS),
			'a session nobody had reached for weeks was swept before it could reconnect'
		);
		assert.ok(
			await resumeSession(db, live.token, AT + SESSION_ABSOLUTE_LIFETIME_MS),
			'a sign-in from this morning was swept'
		);
	});
});

// One person, two machines. Ending one machine's session by signing in on another would be a
// three-day window that closes whenever somebody opens a laptop.
test('signing in twice gives two sessions and neither ends the other', async () => {
	await withDatabase(async (db) => {
		const account = await anAccount(db);
		const first = await startSession(db, account.id, AT);
		const second = await startSession(db, account.id, AT);

		assert.notEqual(first.token, second.token);
		assert.ok(await resumeSession(db, first.token, AT + A_DAY));
		assert.ok(await resumeSession(db, second.token, AT + A_DAY));
	});
});
