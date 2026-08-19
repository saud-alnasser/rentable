import { sql } from 'drizzle-orm';

import type { Database } from '../database/database.ts';
import { account } from '../database/schema.ts';
import { declineRenewal } from './session.ts';

/**
 * Declining to renew, named the way an operator can name it.
 *
 * **{@link declineRenewal} takes an account id and an operator holds an email address**, which is
 * the whole of what this adds. Requirement 18 asks that the mechanism become callable, and a
 * mechanism callable only with a value nobody has to hand is one somebody will get wrong. That is
 * acceptance criterion 19 in as many words.
 *
 * **An address is not an identity here, and that is why this can refuse.** `account.email` carries
 * no unique index, deliberately: an address freed and reassigned belongs to a different Google
 * subject and so to a different person and a different row (`../database/schema.ts`). So an
 * address may name two accounts, and the only safe answer is to say which and do nothing. Acting
 * on both would end a stranger's sessions and answer with a number that looks exactly like
 * success.
 */
export type Declined =
	/** one account matched, and this many of its sessions ended. Zero is a real answer. */
	| { outcome: 'declined'; accountId: string; email: string; ended: number }
	| { outcome: 'no-such-account'; email: string }
	/** the address names more than one account, and none of them was touched. */
	| { outcome: 'ambiguous'; email: string; accountIds: string[] };

/**
 * End every session one account holds, naming that account by its email address.
 *
 * **Matched without regard to case**, because the operator is typing rather than copying an id
 * and SQLite compares `TEXT` case-sensitively. Google hands this control plane a lowercased
 * address, so a mismatch here is the operator's shift key rather than two different people; where
 * it really is two, the ambiguous answer already covers it.
 *
 * **Nothing records that this happened**, which is decision 14 rather than an oversight: the rows
 * that would have said somebody was removed are the rows it removes, and a record needs a notion
 * of who acted that this control plane does not have. The count is the whole of what the operator
 * gets back, and it is enough to tell *nobody was signed in* from *somebody was and is not now*.
 */
export const declineRenewalForEmail = async (db: Database, email: string): Promise<Declined> => {
	const wanted = email.trim().toLowerCase();

	const matched = await db
		.select({ id: account.id })
		.from(account)
		.where(sql`lower(${account.email}) = ${wanted}`);

	if (matched.length === 0) {
		return { outcome: 'no-such-account', email: wanted };
	}

	if (matched.length > 1) {
		return {
			outcome: 'ambiguous',
			email: wanted,
			// sorted so that two runs of the same ambiguous address read the same way, and an
			// operator comparing them is comparing the accounts rather than the row order.
			accountIds: matched.map(({ id }) => id).sort()
		};
	}

	const [only] = matched;

	if (!only) {
		throw new Error('one account matched and the row did not come back');
	}

	return {
		outcome: 'declined',
		accountId: only.id,
		email: wanted,
		ended: await declineRenewal(db, only.id)
	};
};
