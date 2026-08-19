import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { connect } from '@tursodatabase/sync';
import { getTableName, sql } from 'drizzle-orm';

import type { Host } from '$lib/platform/host.ts';
import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { connectHostedReplica } from '../hosted.ts';
import { createMemoryDatabase } from '../memory.ts';
import * as s from '../schema.ts';

// HOSTED
//
// Every replica below is disconnected, and it is disconnected the only way a test can hold on
// its own: it has nothing to reach. `url` answers `null`, or it answers a remote whose every
// request is refused. That is what an aeroplane is to this engine — there is no network state
// underneath it to switch off.
//
// What that covers is the *mechanism* of acceptance criteria 7 and 8: reads and writes land in
// the replica and never on a wire. What it does not cover is a remote that is really there,
// which is named on the tests that reach for it.

/**
 * The migrations this replica is built from, read from the package rather than from
 * `tauri/migrations/`.
 *
 * **That directory is a build artifact and this test never runs a build.** `tauri/build.rs`
 * mirrors the package into it because the Rust runner takes a directory and Tauri bundles one,
 * and `./migrations.test.ts` asserts it stays gitignored — so on any clean checkout it does not
 * exist until Rust has compiled. Read from a machine that had built once, it is there and this
 * passes; read from CI, it is not, and `readdir` fails with `ENOENT` on five tests at once.
 *
 * The package is the source either way, so reading it is both the fix and the more truthful
 * thing to point at.
 */
const MIGRATIONS = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../../../../packages/workspace-migrations/migrations'
);

/** a fixed instant, so contract statuses derive identically from run to run. */
const NOW = Date.UTC(2026, 7, 18);

/**
 * The only host capability a procedure in this file reads.
 *
 * Asserted rather than satisfied, and deliberately: `Host` is eleven capability groups the
 * desktop shell answers, and a fake that implemented the other ten would be ten pieces of
 * fiction standing between a failure and its cause. The same shape as the router harness in
 * `$lib/api/tests/testing.ts`, with the assertion written down.
 */
const HOST = {
	settings: { get: async () => ({ endingSoonNoticeDays: 60, locale: 'en' }) }
} as unknown as Host;

/** a remote that is named and never answers, which is what every test here is offline from. */
const UNREACHABLE = 'libsql://rentable-tests.turso.io';

const refuse: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));

type Workspace = Awaited<ReturnType<typeof openWorkspace>>;
type Api = Workspace['api'];

/**
 * A replica on a disconnected machine, carrying this application's schema, with the real API
 * bound to it.
 *
 * **The schema is applied through the client**, statement by statement, which is both how a
 * test gets to a populated starting state with no remote to pull one from and a demonstration
 * that the transport carries whatever it is given. A real hosted workspace never does this: its
 * migrations are the control plane's, applied to the remote at the token mint (decision 06), so
 * a replica of one arrives with them already in it.
 */
async function openWorkspace(options: { url?: () => string | null; fetch?: typeof fetch } = {}) {
	const directory = await mkdtemp(path.join(tmpdir(), 'rentable-hosted-'));

	const replica = await connectHostedReplica({
		path: path.join(directory, 'workspace.db'),
		url: options.url ?? (() => null),
		fetch: options.fetch,
		clientName: path.basename(directory)
	});

	for (const file of (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort()) {
		const migration = await readFile(path.join(MIGRATIONS, file), 'utf8');

		for (const statement of migration.split('--> statement-breakpoint')) {
			if (statement.trim().length > 0) {
				await replica.db.run(sql.raw(statement));
			}
		}
	}

	const ctx = await context({ db: replica.db, clock: { now: () => NOW }, host: HOST });

	return {
		replica,
		api: caller(appRouter)(ctx),
		async dispose() {
			await replica.close();
			await rm(directory, { recursive: true, force: true });
		}
	};
}

function monthsFromNow(months: number, days = 0) {
	const base = new Date(NOW);

	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate() + days);
}

let sequence = 0;

/**
 * One record of every concept the schema carries, created through the procedures a person's
 * actions go through rather than written into the tables.
 *
 * `history` is in the list for the reason `identity.test.ts` gives: nothing joins its rows at
 * write time and no constraint would notice a duplicate, so it is the table a merge could lose
 * a record in with nothing objecting.
 */
async function seedEveryConcept(api: Api, label: string) {
	sequence += 1;
	const suffix = String(sequence).padStart(4, '0');

	const tenant = await api.tenant.create({
		name: `Tenant ${label}`,
		nationalId: `1000${suffix}00`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
	const complex = await api.complex.create({ name: `Complex ${label}`, location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: `Unit ${label}`, complexId: complex.id });
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		// three times what the seeded payment covers, so a test recording a second one is not
		// refused for a reason that has nothing to do with the network
		cost: 3000
	});

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1000
	});

	await api.history.append({
		entries: [
			{ concept: 'contract', recordId: contract.id, action: 'created', record: `CT-${label}` }
		]
	});

	const [entry] = await api.history.getMany({ concept: 'contract', recordId: contract.id });

	return {
		tenant: tenant.id,
		complex: complex.id,
		unit: unit.id,
		contract: contract.id,
		payment: payment.id,
		history: entry.id
	};
}

/**
 * Acceptance criterion 10, and it is the reason the whole of this file is affordable.
 *
 * A hosted workspace is a third caller of `createDatabase`, so the client it produces is the
 * same object shape the in-memory one is — same driver, same row mapping, same `Context.db`.
 * Compared by prototype rather than by a name, because a name is what a second client type
 * would also have.
 */
test('a hosted replica hands back the client type every other mode already uses', async () => {
	const workspace = await openWorkspace();

	try {
		assert.equal(
			Object.getPrototypeOf(workspace.replica.db),
			Object.getPrototypeOf(createMemoryDatabase()),
			'the hosted client should be the same kind of client the tests and production already run'
		);
	} finally {
		await workspace.dispose();
	}
});

/**
 * The constraint the client is written under, measured rather than argued.
 *
 * `HostedReplicaOptions.url` is typed as a function so this cannot be written by accident;
 * what follows is why the type is worth the awkwardness. A string handed to a remote that
 * cannot be reached fails inside `connect()` and leaves nothing behind — a fresh install on a
 * disconnected machine would be dead — and the same replica opens when the same remote is
 * behind a function that has not answered yet.
 */
test('a remote named as a string is dead offline, and the same remote behind a function is not', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'rentable-hosted-'));

	try {
		await assert.rejects(
			() => connect({ path: path.join(directory, 'string.db'), url: UNREACHABLE, fetch: refuse }),
			'a remote given as a string should fail to open when it cannot be reached'
		);

		const deferred = await connect({
			path: path.join(directory, 'deferred.db'),
			url: () => null,
			fetch: refuse
		});

		await deferred.exec('create table probe (id text primary key)');
		await deferred.close();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

/**
 * Acceptance criterion 7, at the level the surfaces read through.
 *
 * Every list and record procedure in the application, run against a replica with nothing to
 * reach. Counted per surface rather than sampled: a surface that quietly answered nothing would
 * otherwise pass by leaving the run green.
 */
test('with no network, every list and record surface renders from the replica', async () => {
	const workspace = await openWorkspace();

	try {
		const seeded = await seedEveryConcept(workspace.api, 'A');
		const { api } = workspace;

		const lists = {
			tenants: (await api.tenant.getMany({})).length,
			complexes: (await api.complex.getMany({})).length,
			units: (await api.complex.units.getMany({ complexId: seeded.complex })).length,
			contracts: (await api.contract.getMany({})).length,
			contractUnits: (await api.contract.units.getMany({ contractId: seeded.contract })).length,
			payments: (await api.contract.payments.getMany({ contractId: seeded.contract })).length,
			history: (await api.history.getMany({ concept: 'contract', recordId: seeded.contract }))
				.length
		};

		for (const [surface, count] of Object.entries(lists)) {
			assert.equal(count, 1, `the ${surface} list should have rendered its one record`);
		}

		const records = {
			tenant: (await api.tenant.get({ id: seeded.tenant }))?.id,
			complex: (await api.complex.get({ id: seeded.complex }))?.id,
			unit: (await api.complex.units.get({ id: seeded.unit }))?.id,
			contract: (await api.contract.get({ id: seeded.contract }))?.id,
			payment: (await api.contract.payments.get({ id: seeded.payment }))?.id
		};

		for (const [concept, id] of Object.entries(records)) {
			assert.equal(id, seeded[concept as keyof typeof records], `the ${concept} record`);
		}

		// the dashboard is the one read that aggregates rather than lists, and it is what the
		// landing surface draws — a replica that served every list and no aggregate would still
		// leave the application blank where a user starts.
		const dashboard = await api.contract.dashboard({ period: 'this-month' });

		assert.ok(dashboard, 'the dashboard should have rendered from the replica');

		// nothing above went near a wire. If it had, this would not be zero.
		assert.equal(
			(await workspace.replica.stats()).networkReceivedBytes,
			0,
			'a disconnected replica should have received nothing over the network'
		);
	} finally {
		await workspace.dispose();
	}
});

/**
 * Acceptance criterion 8. It is the action the product is for, and the one option C was
 * rejected for trading away.
 */
test('with no network, recording a payment succeeds and is there to read back', async () => {
	const workspace = await openWorkspace();

	try {
		const seeded = await seedEveryConcept(workspace.api, 'A');

		const recorded = await workspace.api.contract.payments.create({
			contractId: seeded.contract,
			date: monthsFromNow(0),
			amount: 1000
		});

		const payments = await workspace.api.contract.payments.getMany({
			contractId: seeded.contract
		});

		assert.equal(payments.length, 2, 'both payments should be in the replica');
		assert.ok(
			payments.some((payment) => payment.id === recorded.id),
			'the payment recorded with no network should be the one read back'
		);
	} finally {
		await workspace.dispose();
	}
});

/**
 * The other half of what "offline" means once a workspace has a remote: it is named, it is not
 * answering, and the application carries on.
 *
 * The refusal to push names its own reason while the remote is unknown, and once the URL starts
 * answering the engine reaches for it — which is the deferred sync the string form cannot do.
 * Neither refusal costs the write, which is the property the criteria rest on.
 */
test('a replica whose remote is not answering keeps taking writes, and says why it cannot push', async () => {
	let online = false;
	const workspace = await openWorkspace({
		url: () => (online ? UNREACHABLE : null),
		fetch: refuse
	});

	try {
		const seeded = await seedEveryConcept(workspace.api, 'A');

		await assert.rejects(
			() => workspace.replica.push(),
			/sync is paused/,
			'a replica with no remote yet should refuse to push in words naming that'
		);

		online = true;

		await assert.rejects(
			() => workspace.replica.push(),
			'a remote that refuses every request should fail the push rather than swallow it'
		);

		// what the two failed pushes did not do is lose anything: the write is still local, and
		// it is still pending, which is what makes it pushable when the remote does answer.
		assert.equal(
			(await workspace.api.contract.payments.getMany({ contractId: seeded.contract })).length,
			1,
			'a failed push should not have cost the write it could not send'
		);
		assert.ok(
			(await workspace.replica.stats()).cdcOperations > 0,
			'the replica should still be holding changes the remote has not seen'
		);
	} finally {
		await workspace.dispose();
	}
});

/**
 * Acceptance criterion 17, as far as it reaches without a live account.
 *
 * Two replicas that have never met each populate every concept, and the two sets are then put
 * in one database through the same transport — which is what a push of each into the remote
 * amounts to for records neither side has seen. Counted per concept, `history` included.
 *
 * **What a live account still has to answer** is the engine's own merge: this drives the
 * copy through `createDatabase`'s two functions rather than through `push()`, so it
 * demonstrates that the identities do not collide and the rows can coexist, not that the sync
 * protocol carries them. Decision 11 measured that half against a live database — two text-key
 * records, both surviving, both distinct — and #552 is the ticket that keeps it as a test.
 */
test('two disconnected replicas populate every concept, and the merged workspace holds all of it', async () => {
	const [here, there] = await Promise.all([openWorkspace(), openWorkspace()]);

	try {
		const [a, b] = await Promise.all([
			seedEveryConcept(here.api, 'A'),
			seedEveryConcept(there.api, 'B')
		]);

		const concepts = ['tenant', 'complex', 'unit', 'contract', 'payment', 'history'] as const;
		const minted = [...concepts.map((c) => a[c]), ...concepts.map((c) => b[c])];

		assert.equal(
			new Set(minted).size,
			minted.length,
			'no two records should share an identity across two replicas that have never met'
		);

		// tables in write order, so a row never arrives before what it points at
		const tables = [s.tenant, s.complex, s.unit, s.contract, s.contractUnit, s.payment, s.history];

		for (const table of tables) {
			const rows = await there.replica.db.select().from(table);

			if (rows.length > 0) {
				await here.replica.db.insert(table).values(rows);
			}
		}

		const counted: Record<string, number> = {};

		for (const table of tables) {
			const [row] = await here.replica.db.select({ total: sql<number>`count(*)` }).from(table);
			counted[getTableName(table)] = row.total;
		}

		for (const [table, total] of Object.entries(counted)) {
			assert.equal(total, 2, `${table} should hold both replicas' records after the merge`);
		}

		// and both are still readable as records rather than as rows
		assert.equal((await here.api.tenant.getMany({})).length, 2);
		assert.equal((await here.api.contract.getMany({})).length, 2);
	} finally {
		await Promise.all([here.dispose(), there.dispose()]);
	}
});
