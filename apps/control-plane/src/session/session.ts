import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte } from 'drizzle-orm';

import type { Database } from '../database/database.ts';
import { Refusal, SESSION_EXPIRED } from '../failure.ts';
import { account, session, type Account } from '../database/schema.ts';

/**
 * How long a session lasts without being heard from.
 *
 * **Three days, and it is requirement 15's window rather than a number chosen beside it.** A
 * signed-in client works offline for three days; any reach inside the window renews it and the
 * window restarts from the renewal; past three days with no contact the client has nothing left
 * to present and has to sign in with Google again.
 *
 * It is deliberately the same number as `TOKEN_LIFETIME` in `../workspace/workspace.ts`, which
 * is what a workspace's *data* credential expires after. **Equal lengths are not the same thing
 * as one clock, and equal lengths were never the risk**: the two are started by different calls,
 * so a client that renewed its session without minting would carry a live session and a dead
 * replica credential. That is why the mint answers with both windows and is the renewal a client
 * holding a workspace uses — reached there, the two restart together. A client that holds both
 * numbers believes the earlier of them.
 *
 * #550 checked the number itself against the requirement and agrees with it.
 */
export const SESSION_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The prefix every session token carries.
 *
 * **It is what tells a session token from a Google access token on the same header**, which is
 * the one thing `../server/server.ts` has to decide before it can decide anything else. Both
 * arrive as `Authorization: Bearer <opaque string>`, and guessing wrong means either asking
 * Google about a string it has never seen or looking a Google token up in this table — two
 * failures that read as *your sign-in is bad* when neither is. Google's access tokens begin
 * `ya29.`; nothing Google issues begins with this.
 */
export const SESSION_TOKEN_PREFIX = 'rws_';

export const looksLikeSessionToken = (token: string) => token.startsWith(SESSION_TOKEN_PREFIX);

/** what a client is given, and what it presents afterwards. */
export type IssuedSession = {
	token: string;
	/**
	 * when this stops being renewable, as epoch milliseconds.
	 *
	 * **Issued here, so the client cannot move it.** The client holds it in order to know when to
	 * stop trying and say what to do, which is a courtesy rather than the enforcement — the
	 * enforcement is that a token past this moment is refused whatever the client believes.
	 */
	expiresAt: number;
};

const digestOf = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * A new token, from the operating system's own source of randomness.
 *
 * 32 bytes rather than a UUID: a v4 UUID carries 122 bits and is generated to be *unique*, where
 * this has to be unguessable. The two are not the same requirement and only one of them is a
 * property of the identifiers this database uses elsewhere.
 */
const newToken = () => `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

/**
 * Start a session for an account that has just been vouched for.
 *
 * Nothing is cleaned up here and that is deliberate: a person signs in on more than one machine
 * and each machine holds its own session. What ends a session is the window, or
 * {@link declineRenewal}.
 */
export const startSession = async (
	db: Database,
	accountId: string,
	now: number
): Promise<IssuedSession> => {
	const token = newToken();
	const expiresAt = now + SESSION_LIFETIME_MS;

	await db.insert(session).values({
		id: crypto.randomUUID(),
		accountId,
		tokenDigest: digestOf(token),
		createdAt: new Date(now),
		renewedAt: new Date(now),
		expiresAt: new Date(expiresAt)
	});

	return { token, expiresAt };
};

/**
 * Take a session up again, and restart its window.
 *
 * **Reaching this process at any point inside the window renews the session** — so this is both
 * the check every route makes and the whole of what `POST /session/refresh` does. A client that
 * has been syncing all week never has to think about renewal; a client that has done nothing but
 * stay open has one route to reach.
 *
 * The refusal is the same whether the token was never issued, has run out, or belonged to a
 * session that was declined. **That is one answer on purpose**: all three leave the client with
 * the same move to make, and distinguishing them tells whoever is holding a string they should
 * not have whether it was ever real.
 */
export const resumeSession = async (
	db: Database,
	token: string,
	now: number
): Promise<{ account: Account; session: IssuedSession }> => {
	const expiresAt = now + SESSION_LIFETIME_MS;

	// One statement, and the window is part of the `where` rather than of a branch after it: a
	// session read as live and then renewed is two statements a request could expire between,
	// and this way an expired row is simply not matched and no row comes back.
	const [renewed] = await db
		.update(session)
		.set({ renewedAt: new Date(now), expiresAt: new Date(expiresAt) })
		.where(and(eq(session.tokenDigest, digestOf(token)), gt(session.expiresAt, new Date(now))))
		.returning();

	if (!renewed) {
		throw new Refusal(
			SESSION_EXPIRED,
			401,
			'your sign-in has run out. sign in with google again to keep this workspace in sync'
		);
	}

	const [holder] = await db
		.select()
		.from(account)
		.where(eq(account.id, renewed.accountId))
		.limit(1);

	if (!holder) {
		// The foreign key makes this unreachable short of the account being deleted mid-request.
		// It is a refusal rather than a throw because the caller's move is the same as for any
		// other dead session, and a 500 would tell them to retry something that cannot succeed.
		throw new Refusal(
			SESSION_EXPIRED,
			401,
			'your sign-in has run out. sign in with google again to keep this workspace in sync'
		);
	}

	return { account: holder, session: { token, expiresAt } };
};

/**
 * Stop renewing this account's sessions.
 *
 * **This is what removing somebody is**, and it is the mechanism rather than the surface that
 * decides to use it. Turso's own revocation is bulk-only and rotates every token in the group
 * with no published propagation time (decision 01), which cannot remove one member of one
 * workspace. Declining to renew is per-account and takes effect at that account's next reach,
 * bounded by {@link SESSION_LIFETIME_MS} — a bound this repository sets rather than inherits.
 *
 * Answers how many sessions it ended, so a caller can tell *nobody was signed in* from *somebody
 * was and is not now*.
 */
export const declineRenewal = async (db: Database, accountId: string): Promise<number> => {
	const ended = await db.delete(session).where(eq(session.accountId, accountId)).returning();

	return ended.length;
};

/**
 * Remove sessions that ran out, and answer how many.
 *
 * Nothing calls this on a timer yet and nothing needs to: an expired row is already inert,
 * because {@link resumeSession} will not match it. It exists so that whatever ends up running
 * maintenance has one honest place to call, rather than writing a `delete` against this table
 * from somewhere that does not know what the window is.
 */
export const forgetExpiredSessions = async (db: Database, now: number): Promise<number> => {
	const removed = await db
		.delete(session)
		.where(lte(session.expiresAt, new Date(now)))
		.returning();

	return removed.length;
};
