import * as s from '../src/lib/platform/database/schema';
import { openWorkspaceDatabase, write } from './database';

/**
 * Empty this machine's workspace of records, leaving the workspace itself.
 *
 * The order is the foreign keys read backwards: payments before contracts, the join before either
 * side of it, units before the complexes that hold them.
 *
 * **It says which file it emptied**, because it can no longer be assumed — see `./database`.
 *
 * **On a replica this empties the workspace, not just this machine, and it does so before it
 * returns.** The deletes go through the sync engine and `write` pushes them, so by the time this
 * prints they are the hosted database's state and every other device will pull them. That is the
 * correct behaviour for a dev workspace and the wrong surprise for one with anything in it worth
 * keeping. *Until 2026-08-20 the push never happened, which made this look far safer than it is.*
 */
const purge = async () => {
	const target = await openWorkspaceDatabase();

	await write(target, async ({ db }) => {
		await db.delete(s.payment);
		await db.delete(s.contractUnit);
		await db.delete(s.contract);
		await db.delete(s.unit);
		await db.delete(s.tenant);
		await db.delete(s.complex);
	});

	return target;
};

purge()
	.then((target) => console.log(`purged ${target.path}`))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
