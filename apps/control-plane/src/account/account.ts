import type { Database } from '../database/database.ts';
import type { GoogleIdentity } from './google.ts';
import { account, type Account } from '../database/schema.ts';

/**
 * Find the account a Google identity belongs to, or make one.
 *
 * **Matched on `subject`, never on the email address.** Google's subject survives an email
 * change and an email address does not survive being reassigned — matching on the address would
 * make one person two accounts the day they change it, and could make two people one account the
 * day a workspace domain reassigns theirs.
 *
 * The profile is refreshed on every sign-in rather than only on the first. Google is the record
 * for a person's own name and picture; a copy taken once and never revisited is a copy that goes
 * quietly wrong.
 *
 * *Ids are `crypto.randomUUID()` — version 4, where the workspace database's are version 7.*
 * Decision 13 chose a time-ordered, client-generated identity because two offline replicas must
 * never agree on an id and inserts must stay sequential in a table replicas append to. Neither
 * holds here: this database is single, always online, and written only by this process.
 */
export const signInWithGoogle = async (
	db: Database,
	identity: GoogleIdentity,
	now: number
): Promise<Account> => {
	// One statement rather than a read and then a write, and the reason is a race that read
	// would lose: two first sign-ins for one person arriving together both find nothing, both
	// insert, and the second is refused by the unique index — a person's very first sign-in
	// failing because they were quick. `createdAt` is deliberately absent from the update, so an
	// account that was found keeps the day it was made.
	const [record] = await db
		.insert(account)
		.values({
			id: crypto.randomUUID(),
			email: identity.email,
			displayName: identity.displayName,
			avatarUrl: identity.avatarUrl,
			googleUserId: identity.subject,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		})
		.onConflictDoUpdate({
			target: account.googleUserId,
			set: {
				email: identity.email,
				displayName: identity.displayName,
				avatarUrl: identity.avatarUrl,
				updatedAt: new Date(now)
			}
		})
		.returning();

	if (!record) {
		throw new Error('the account was written and the row did not come back');
	}

	return record;
};
