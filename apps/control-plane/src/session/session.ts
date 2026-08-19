import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte, sql } from 'drizzle-orm';

import type { Database } from '../database/database.ts';
import { Refusal, SESSION_EXPIRED, SESSION_LIFETIME_REACHED } from '../failure.ts';
import { account, session, type Account } from '../database/schema.ts';

/**
 * How long a client may work without being heard from.
 *
 * **Three days, and it is requirement 15's refresh window rather than a number chosen beside it.**
 * A signed-in client works offline for three days; any reach inside the window renews it and the
 * window restarts from the renewal; past three days with no contact the application locks behind
 * the login page **until a network is available**.
 *
 * **Passing it does not kill the session**, and that changed on 2026-08-19 with the requirement.
 * The lock is a gate rather than a sign-out: when the network returns, the client presents the
 * same token and refreshes with nobody typing anything. What ends a session is
 * {@link SESSION_ABSOLUTE_LIFETIME_MS} or {@link declineRenewal}. A build that refused a token
 * past this window would make every reconnection a Google sign-in, which acceptance criterion 16
 * fails outright.
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
 * How long a sign-in lasts however faithfully the client keeps reaching.
 *
 * **One month, directed by the human on 2026-08-19**: *"each month the user must re-login."* Set
 * when the person signs in and never moved, so the refresh window above slides inside this one
 * rather than past it. Without it a user who opens the application daily stays signed in forever,
 * which is what this repository shipped until now.
 *
 * Thirty days rather than a calendar month: a calendar month is not a duration, and a session
 * that lasted 28 days in February and 31 in March would be a different guarantee depending on
 * when somebody signed in.
 */
export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

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
	 * the refresh window, as epoch milliseconds — how much longer this client may work without
	 * reaching here.
	 *
	 * **Issued here, so the client cannot move it.** The client holds it in order to know when to
	 * stop trying and say what to do, which is a courtesy rather than the enforcement — the
	 * enforcement is that a token past this moment is refused whatever the client believes.
	 */
	expiresAt: number;
	/**
	 * when this sign-in stops being renewable at all, as epoch milliseconds.
	 *
	 * Never moves. A client holding both believes the earlier, which past this moment is always
	 * this one — and unlike {@link IssuedSession.expiresAt}, reaching the API does not help.
	 */
	absoluteExpiresAt: number;
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
	const absoluteExpiresAt = now + SESSION_ABSOLUTE_LIFETIME_MS;

	// The refresh window never reaches past the absolute one. It would make no difference to what
	// this process accepts — renewal is gated on the absolute lifetime — but the client locks
	// itself on the refresh window, and a client told it may work until Tuesday when its sign-in
	// dies on Monday would go on working and then be refused.
	const expiresAt = Math.min(now + SESSION_LIFETIME_MS, absoluteExpiresAt);

	await db.insert(session).values({
		id: crypto.randomUUID(),
		accountId,
		tokenDigest: digestOf(token),
		createdAt: new Date(now),
		renewedAt: new Date(now),
		expiresAt: new Date(expiresAt),
		absoluteExpiresAt: new Date(absoluteExpiresAt)
	});

	return { token, expiresAt, absoluteExpiresAt };
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
	// One statement, and the window is part of the `where` rather than of a branch after it: a
	// session read as live and then renewed is two statements a request could expire between,
	// and this way a dead row is simply not matched and no row comes back.
	//
	// **The gate is the absolute lifetime, not the refresh window.** A client that has been
	// offline for a week is exactly the case requirement 15 asks to serve silently, so its token
	// is still good and this hands it a fresh refresh window. What it cannot outlive is the month.
	const [renewed] = await db
		.update(session)
		.set({
			renewedAt: new Date(now),
			expiresAt: sql`min(${now + SESSION_LIFETIME_MS}, ${session.absoluteExpiresAt})`
		})
		.where(
			and(eq(session.tokenDigest, digestOf(token)), gt(session.absoluteExpiresAt, new Date(now)))
		)
		.returning();

	if (!renewed) {
		// The extra read is on the failure path only, and it is what makes the two refusals
		// tell apart: a token whose month is up asks for a Google re-login, while one that was
		// never issued or was declined asks for a sign-in and nothing more specific.
		const [held] = await db
			.select({ absoluteExpiresAt: session.absoluteExpiresAt })
			.from(session)
			.where(eq(session.tokenDigest, digestOf(token)))
			.limit(1);

		if (held) {
			throw new Refusal(
				SESSION_LIFETIME_REACHED,
				401,
				'this sign-in is a month old. sign in with google again to carry on'
			);
		}

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

	return {
		account: holder,
		session: {
			token,
			expiresAt: renewed.expiresAt.getTime(),
			absoluteExpiresAt: renewed.absoluteExpiresAt.getTime()
		}
	};
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
 * **The absolute lifetime is what makes a row removable, not the refresh window.** A session
 * three days past its last reach is still refreshable and sweeping it would take away the silent
 * reconnection requirement 15 asks for; a session past its month can never be presented again.
 *
 * Nothing calls this on a timer yet and nothing needs to: a dead row is already inert, because
 * {@link resumeSession} will not match it. It exists so that whatever ends up running maintenance
 * has one honest place to call, rather than writing a `delete` against this table from somewhere
 * that does not know what the windows are.
 */
export const forgetExpiredSessions = async (db: Database, now: number): Promise<number> => {
	const removed = await db
		.delete(session)
		.where(lte(session.absoluteExpiresAt, new Date(now)))
		.returning();

	return removed.length;
};
