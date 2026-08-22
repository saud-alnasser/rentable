import type { Account, Workspace } from '../database/schema.ts';
import type { IssuedSession } from '../session/session.ts';

/**
 * What a route answers with, built by hand.
 *
 * **These are still the contract, and that is temporary.** #743 replaces them with response
 * declarations the framework serializes through, which is what makes a field that is not declared
 * unable to ship. Until then a field added to `Account` or `Workspace` and spread into a response
 * is a field that ships, exactly as it was before this file existed.
 */

/** an account as it goes over the wire, with timestamps as epoch milliseconds, as the desktop reads them. */
export const wireAccount = (record: Account) => ({
	id: record.id,
	email: record.email,
	displayName: record.displayName,
	avatarUrl: record.avatarUrl,
	googleUserId: record.googleUserId,
	createdAt: record.createdAt.getTime(),
	updatedAt: record.updatedAt.getTime()
});

/**
 * a workspace as it goes over the wire.
 *
 * The database's *name* stays here: it is what the Platform API calls it by, and a client that
 * holds it holds the one argument every administrative call to Turso takes. The hostname is
 * what a client actually needs, and it gets it as part of a mint rather than on its own.
 *
 * **`permissions` arrives as an argument rather than being read off the record**, because a
 * workspace does not have permissions: an account has them *in* a workspace, and this function is
 * handed a `Workspace` and no idea who is asking. Both call sites already hold that account and
 * already have its membership row in hand, so passing the number costs neither of them a query.
 *
 * What the number means is `@rentable/workspace-permission`'s and is never decoded here: the wire
 * carries it, and each end reads it through the same `permits`.
 */
export const wireWorkspace = (record: Workspace, permissions: number) => ({
	id: record.id,
	name: record.name,
	ownerAccountId: record.ownerAccountId,
	permissions,
	createdAt: record.createdAt.getTime(),
	updatedAt: record.updatedAt.getTime()
});

/**
 * a session as it goes over the wire.
 *
 * **Both of the session's moments ride with the token, and they are not the same kind of thing.**
 * `expiresAt` is the refresh window: how much longer this client may work without reaching here,
 * which it obeys by locking itself, and which a reach moves. `absoluteExpiresAt` is when the
 * sign-in stops being renewable at all. Enforced here, whatever the client believes, which is
 * why the client is given the number rather than trusted to keep one.
 */
export const wireSession = (issued: IssuedSession) => ({
	token: issued.token,
	expiresAt: issued.expiresAt,
	absoluteExpiresAt: issued.absoluteExpiresAt
});
