import type { Database } from '../database/database.ts';
import { workspace } from '../database/schema.ts';
import { targetSchemaVersion, type ConnectToWorkspaceDatabase } from './migration.ts';
import type { TursoPlatform } from './turso.ts';
import { migrateWorkspaceTo } from './workspace.ts';

/**
 * Migrating every workspace this control plane knows about, ahead of the people using them.
 *
 * **This is a mechanism and it is not the owner.** Decision 06 rejected a deploy-time sweep *as
 * the owner* of a hosted workspace's schema — it cannot answer for a workspace created after it
 * ran, it grows without bound, and a partial sweep leaves the estate at two versions with nothing
 * recording which is which. The mint is the owner and stays it: a workspace nobody opens costs
 * nothing, and the first client to open one pays for its migration.
 *
 * What the sweep is for is the case the lazy path cannot serve: **a migration with a deadline.**
 * Where a schema has to be in place by a date rather than by a visit, this walks the estate and
 * puts it there. It is run by a person, at a moment they chose, and it is not wired into a deploy
 * — which is the difference between a mechanism kept and an owner rejected.
 *
 * **It migrates to what this build ships, which is the one thing the mint will not do.** A
 * workspace it takes past a client's version refuses that client at the next mint, and telling
 * somebody to update the application is the intended effect rather than a side effect: it is what
 * a deadline means.
 */
export type Swept = {
	workspaceId: string;
	/** where it was before, and where it is now — equal where there was nothing to apply. */
	from: number;
	to: number;
};

export type Sweep = {
	swept: Swept[];
	/** a workspace whose migration failed, with the reason, so one failure does not end the run. */
	failed: { workspaceId: string; reason: string }[];
	target: number;
};

/**
 * Bring every workspace up to the version this build ships, and report what happened to each.
 *
 * **One workspace's failure does not end the run**, and that is the whole difference between this
 * and a deploy step. A sweep that stops at the first refusal leaves the estate at two versions
 * with nothing saying which is which — decision 06's own objection to option C. This finishes,
 * and answers with the ones it could not do, which a person reads and retries.
 */
export const sweepWorkspaceSchemas = async (
	db: Database,
	platform: TursoPlatform,
	connect: ConnectToWorkspaceDatabase,
	{ now }: { now: number }
): Promise<Sweep> => {
	const target = await targetSchemaVersion();
	const records = await db.select().from(workspace);
	const swept: Swept[] = [];
	const failed: Sweep['failed'] = [];

	for (const record of records) {
		if (record.schemaVersion >= target) {
			swept.push({ workspaceId: record.id, from: record.schemaVersion, to: record.schemaVersion });
			continue;
		}

		try {
			const to = await migrateWorkspaceTo(db, platform, connect, record, { upTo: target, now });
			swept.push({ workspaceId: record.id, from: record.schemaVersion, to });
		} catch (error: unknown) {
			failed.push({
				workspaceId: record.id,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return { swept, failed, target };
};
