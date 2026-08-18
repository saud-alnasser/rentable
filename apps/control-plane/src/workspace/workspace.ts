import { and, eq } from 'drizzle-orm';

import type { Database } from '../database/database.ts';
import {
	CLIENT_OUT_OF_DATE,
	NO_SUCH_WORKSPACE,
	NOT_A_MEMBER,
	Refusal,
	SERVICE_OUT_OF_DATE
} from '../failure.ts';
import { ADMINISTRATION_BY_ROLE } from './permission.ts';
import { membership, workspace, type Workspace } from '../database/schema.ts';
import {
	migrateWorkspaceDatabase,
	MIGRATION_TOKEN_LIFETIME,
	targetSchemaVersion,
	versionOfWorkspaceDatabase,
	type ConnectToWorkspaceDatabase
} from './migration.ts';
import type { TursoPlatform } from './turso.ts';

/**
 * How long a minted token lives, in Turso's own duration spelling.
 *
 * **Three days, because requirement 15's window and this number are the same thing.** The
 * requirement is that a signed-in client survives three days without a connection and that any
 * connection inside the window renews it. Implemented as a client-side flag that would be a
 * window the client can decline to close; implemented as a token lifetime it cannot be faked,
 * because the thing the client needs is issued here. So the window *is* the expiry, and picking
 * a different number would be picking a different requirement.
 *
 * It is also the bound on removing somebody. Turso's own revocation is bulk-only and rotates
 * every token in the group with no published propagation time (decision 01), so what this
 * repository offers instead is *declining to renew* — per-user, and effective within one
 * lifetime of the decision. #550 demonstrates the window against the requirement and gets to
 * disagree with this number.
 */
export const TOKEN_LIFETIME = '3d';

const TOKEN_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The database name a workspace's data lives under.
 *
 * Turso permits lowercase letters, numbers and dashes, up to 64 characters. A UUID is 36 of
 * those and already legal, so the name is the workspace's own id with a prefix — which means the
 * mapping is readable in both directions from either side, and no second column has to be
 * consulted to find out which database a workspace is talking about.
 */
export const databaseNameFor = (workspaceId: string) => `ws-${workspaceId}`;

export type CreatedWorkspace = { workspace: Workspace };

/**
 * Make a workspace: a database on Turso, a record naming it, and the asking account's own
 * membership of it as owner.
 *
 * **The database is created first and removed again if the record cannot be written.** The other
 * order — record first, database after — leaves a workspace that names no database, which every
 * reader would then have to handle for a state only a crash produces. This order leaves at worst
 * an unreferenced database on Turso, and only where the removal *also* fails, which is logged.
 *
 * **The record and the membership are one transaction**, because the failure between them is
 * worse than either alone: a workspace nobody is a member of is a workspace nobody can reach and
 * nobody can delete, and the cleanup below would have removed its database while leaving the row
 * that names it.
 */
export const createWorkspace = async (
	db: Database,
	platform: TursoPlatform,
	{ accountId, name, now }: { accountId: string; name: string; now: number }
): Promise<Workspace> => {
	const id = crypto.randomUUID();
	const created = await platform.createDatabase(databaseNameFor(id));

	try {
		return await db.transaction(async (tx) => {
			const [record] = await tx
				.insert(workspace)
				.values({
					id,
					name,
					ownerAccountId: accountId,
					databaseName: created.name,
					databaseHostname: created.hostname,
					createdAt: new Date(now),
					updatedAt: new Date(now)
				})
				.returning();

			if (!record) {
				throw new Error('the workspace was written and the row did not come back');
			}

			await tx.insert(membership).values({
				workspaceId: id,
				accountId,
				role: 'owner',
				permissions: ADMINISTRATION_BY_ROLE.owner,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			});

			return record;
		});
	} catch (error) {
		await platform.deleteDatabase(created.name).catch((removal: unknown) => {
			console.error(
				'a workspace database was created and is now unreferenced',
				created.name,
				removal
			);
		});

		throw error;
	}
};

export type MintedToken = {
	token: string;
	/**
	 * What the client syncs against.
	 *
	 * **A string on the wire, and that is not the string decision 11 rules out.** Its constraint
	 * is on what the *sync client* is handed — a function, answering `null` until online, because
	 * a string for an unreachable remote makes `connect()` throw and leaves no usable local
	 * database. This is the value that function returns once there is one to return; nothing here
	 * obliges a caller to pass it straight through.
	 */
	url: string;
	expiresAt: number;
};

/**
 * Bring one workspace's database up to `upTo`, and record where it got to.
 *
 * **This is the only place the control plane opens a workspace database**, and it opens it with a
 * token it mints for the occasion — the same Platform API call a client's token comes from, for
 * half an hour rather than three days, and never handed to anybody. The connection is closed
 * whether or not the migration succeeded.
 *
 * **The record is written from the database's own ledger rather than from what was asked for**,
 * including when the migration fails part-way: the ledger is the authority and this column is an
 * index of it, so leaving the two disagreeing would leave the mint deciding on a number that is
 * too low — and too low is the direction that lets an older client through. A migration that dies
 * after applying two of four files therefore records 2, and the next attempt starts from there.
 */
export const migrateWorkspaceTo = async (
	db: Database,
	platform: TursoPlatform,
	connect: ConnectToWorkspaceDatabase,
	record: Workspace,
	{ upTo, now }: { upTo: number; now: number }
): Promise<number> => {
	const client = connect({
		url: `libsql://${record.databaseHostname}`,
		authToken: await platform.mintToken(record.databaseName, MIGRATION_TOKEN_LIFETIME)
	});

	const reached = async (at: number) => {
		await db
			.update(workspace)
			.set({ schemaVersion: at, updatedAt: new Date(now) })
			.where(eq(workspace.id, record.id));

		return at;
	};

	try {
		return await reached(
			await migrateWorkspaceDatabase(client, upTo, { database: record.databaseName })
		);
	} catch (failure: unknown) {
		// Best effort, and it is the same database that just failed — where it cannot be read
		// either, the column stays where it was and the guard in the mint is what covers it.
		await versionOfWorkspaceDatabase(client).then(reached, () => undefined);

		throw failure;
	} finally {
		client.close();
	}
};

/**
 * Mint a token for one member of one workspace, at a schema both sides understand.
 *
 * **Membership is consulted on every mint, which is what makes removal work at all.** There is
 * no state to expire and nothing to propagate: the account either has a row for this workspace
 * when it next asks, or it does not, and the previous token runs out within
 * {@link TOKEN_LIFETIME}. Decision 05 settled that the token is good for the whole workspace
 * database — a disconnected client writes to a replica, so anything finer would be a promise
 * enforced by a server it is not talking to.
 *
 * **The schema is settled here too, and decision 06 put it here on purpose.** The client says
 * which schema version it was built against, and there are four answers — three of them the
 * decision's own:
 *
 * - the version the workspace is already at — mint, and nothing is opened;
 * - **newer** — apply the migrations the workspace is missing, up to the client's version, then
 *   mint. This is the ordinary upgrade path: the first client to arrive after a deploy pays for
 *   the migration, and it is by definition online;
 * - **older** — refuse, and issue no token. An older client that synced would replicate a schema
 *   it does not understand and then write against columns it does not know about; by the time a
 *   write failed its replica would already have diverged, and the divergence is what would have
 *   to be repaired. Withholding the credential stops it before the first byte;
 * - newer than anything this build ships a migration for — refuse as well, because there is
 *   nothing to migrate *with*. It is this service that is behind, so it says so and says retry.
 *
 * **A migration that fails takes the mint with it**, which is decision 06's named risk rather
 * than a defect to design away: the user cannot *sync* until it succeeds, and their local
 * workspace carries on untouched, which is what makes it survivable.
 */
export const mintWorkspaceToken = async (
	db: Database,
	platform: TursoPlatform,
	connect: ConnectToWorkspaceDatabase,
	{
		workspaceId,
		accountId,
		schemaVersion,
		now
	}: { workspaceId: string; accountId: string; schemaVersion: number; now: number }
): Promise<MintedToken> => {
	const [record] = await db.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1);

	if (!record) {
		throw new Refusal(NO_SUCH_WORKSPACE, 404, 'that workspace is not one this account can reach');
	}

	const [belongs] = await db
		.select()
		.from(membership)
		.where(and(eq(membership.workspaceId, workspaceId), eq(membership.accountId, accountId)))
		.limit(1);

	if (!belongs) {
		throw new Refusal(NOT_A_MEMBER, 403, 'you are no longer a member of that workspace');
	}

	if (schemaVersion < record.schemaVersion) {
		throw new Refusal(
			CLIENT_OUT_OF_DATE,
			409,
			'this workspace has moved on to a newer version. update the application to open it'
		);
	}

	if (schemaVersion > (await targetSchemaVersion())) {
		throw new Refusal(
			SERVICE_OUT_OF_DATE,
			503,
			'this workspace is still catching up to your version. try again in a moment'
		);
	}

	if (schemaVersion > record.schemaVersion) {
		const reached = await migrateWorkspaceTo(db, platform, connect, record, {
			upTo: schemaVersion,
			now
		});

		// **The refusal is decided again here, against the version the database actually reached.**
		// The column is an index of the workspace database's own ledger and it can lag it — a
		// sweep running while this mint runs is the ordinary way, and a process that died between
		// applying a migration and recording it is the other. A client that passed the test above
		// against a stale number would otherwise trigger a migration that applies nothing, correct
		// the column upward, and be handed a credential for a schema it does not understand:
		// exactly the divergence the first refusal exists to prevent, reached by the one path that
		// skipped it.
		if (reached > schemaVersion) {
			throw new Refusal(
				CLIENT_OUT_OF_DATE,
				409,
				'this workspace has moved on to a newer version. update the application to open it'
			);
		}
	}

	return {
		token: await platform.mintToken(record.databaseName, TOKEN_LIFETIME),
		url: `libsql://${record.databaseHostname}`,
		expiresAt: now + TOKEN_LIFETIME_MS
	};
};
