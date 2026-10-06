import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FLAGS, maskOf } from '@rentable/workspace-permission';
import { eq } from 'drizzle-orm';

import type { Database } from '$lib/api/context.ts';
import { bindSyncRequest, caller, context } from '$lib/api/trpc.ts';
import { fakeHost } from '$lib/app/tests/host.ts';
import { appRouter } from '$lib/app/router.ts';
import {
	type Api,
	createApi,
	EVERY_RECORD_ACT,
	fakeIdentity,
	monthsFromNow,
	NOW,
	refusedWith
} from '$lib/app/tests/testing.ts';
import type { OrganizationWorkspace } from '$lib/organization/host.ts';
import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import * as s from '$lib/platform/database/schema';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';
import { toTables } from './file.ts';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toTransferInput as toInput,
	toUnitReference,
	type WorkspaceTransfer
} from '../index.ts';
import { formatDateInput } from '$lib/date';

/**
 * A workspace built through the ordinary procedures: a tenant, a complex with two units, a
 * contract for that tenant holding one of them, and a payment against it.
 *
 * **The assignment is what makes this fixture worth running.** It used to be asked for by
 * passing `unitIds` to `contract.create`, which does not take them — the key was dropped at the
 * input boundary, no assignment row was ever written, and the round trip below compared an
 * empty list against an empty one for two efforts (#562). It is said properly now, through
 * `contract.units.set`, which is the only procedure that writes one.
 *
 * **Order is load-bearing:** the units are set before the payment, because a contract with a
 * payment recorded against it refuses to have its units changed.
 */
async function seedWorkspace(api: Api) {
	const tenant = await api.tenant.create({
		name: 'Abby Kris',
		nationalId: '1234567890',
		phone: '+966512345678'
	});
	const complex = await api.complex.create({
		name: 'Al Nakheel',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }]
	});
	const contract = await api.contract.create({
		govId: 'GOV-1',
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 18_000
	});

	const [unit] = await api.complex.units.getMany({ complexId: complex.id });

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1500
	});

	return { tenant, complex, contract, unit };
}

test('a workspace exported as a file imports into an empty one and reproduces it', async () => {
	const source = await createApi();

	await seedWorkspace(source);

	const written = await source.transfer.get();
	const target = await createApi();
	const plan = planWorkspaceImport(toTables(written), NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan), 'the file it wrote is a file it can read');

	await target.transfer.importWhole(toInput(plan.transfer));

	const read = await target.transfer.get();

	assert.deepEqual(read.tenants, written.tenants);
	assert.deepEqual(read.complexes, written.complexes);
	// every relationship as well as every record: a unit knows its complex, a contract knows its
	// tenant and the unit it holds, and a payment knows its contract — all by name, because that
	// is the only thing the file carried.
	assert.deepEqual(read.units, written.units);
	// stated before the comparison rather than left to it: two empty lists satisfy a deep
	// equality without the round trip having carried an assignment at all, which is exactly how
	// this test certified #562 for two efforts.
	assert.deepEqual(written.contracts[0].units, [toUnitReference('Al Nakheel', 'A1')]);
	assert.deepEqual(read.payments, written.payments);
	assert.deepEqual(
		read.contracts.map((contract) => ({ ...contract, units: [...contract.units] })),
		written.contracts.map((contract) => ({ ...contract, units: [...contract.units] }))
	);
});

/**
 * What `workspace.get` answered on the build before effort 838 broke the organization format,
 * written once from a workspace seeded through the ordinary procedures and checked in as it came
 * out. It is the file the one existing user carries across: an organization of the older format
 * is refused by name, so each workspace is exported there and imported into a workspace of a new
 * organization here (effort 838, requirement 11). Read as a file rather than regenerated, so a
 * change to either half of the transfer that would strand that export fails here.
 */
function exportedBeforeTheFormatBreak(): WorkspaceTransfer {
	return JSON.parse(readFileSync(new URL('./export.json', import.meta.url), 'utf8'));
}

/** a contract as a record, without the two fields the clock derives: its status and what is due. */
function recordOf({
	reference,
	tenant,
	units,
	start,
	end,
	interval,
	cost,
	paidAmount
}: WorkspaceTransfer['contracts'][number]) {
	return { reference, tenant, units, start, end, interval, cost, paidAmount };
}

test('an export written before the format break imports whole into an empty workspace', async () => {
	const written = exportedBeforeTheFormatBreak();
	const target = await createApi();
	const plan = planWorkspaceImport(toTables(written), NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan), 'the earlier export is not a file this build can read');

	const imported = await target.transfer.importWhole(toInput(plan.transfer));

	assert.deepEqual(imported, {
		tenants: written.tenants.length,
		complexes: written.complexes.length,
		units: written.units.length,
		contracts: written.contracts.length,
		payments: written.payments.length
	});

	const read = await target.transfer.get();

	// every record, and every relationship by the names the file carried. What is derived from the
	// clock is left out: the export was written on another day, so the expected amount and a
	// status are what the term makes them today, and this build recomputes them rather than
	// reading them back. The paid amount is the file's own payments summed, so it has to agree.
	assert.deepEqual(read.tenants, written.tenants);
	assert.deepEqual(read.complexes, written.complexes);
	assert.deepEqual(
		read.units.map(({ complex, name }) => ({ complex, name })),
		written.units.map(({ complex, name }) => ({ complex, name }))
	);
	assert.deepEqual(read.payments, written.payments);
	assert.deepEqual(read.contracts.map(recordOf), written.contracts.map(recordOf));
});

test('the reproduced workspace derives its own statuses rather than trusting the file', async () => {
	const source = await createApi();

	await seedWorkspace(source);

	const written = await source.transfer.get();
	const target = await createApi();
	const plan = planWorkspaceImport(toTables(written), NOW, emptyHeld());

	await target.transfer.importWhole(toInput(plan.transfer));

	const [contract] = await target.contract.getMany({});

	// the file states a status, a paid amount and an expected amount for the reader, and none of
	// the three is read back in — reconciliation recomputes all of them from the term and the
	// payment that came with it.
	assert.equal(contract.paidAmount, written.contracts[0].paidAmount);
	assert.equal(contract.status, written.contracts[0].status);

	const units = await target.complex.units.getMany({
		complexId: (await target.complex.getMany({}))[0].id
	});

	assert.deepEqual(
		units.map((unit) => unit.status).sort(),
		written.units.map((unit) => unit.status).sort()
	);
});

test('a refused write leaves the workspace exactly as it was', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.transfer.get();

	await assert.rejects(
		// the last statement of the batch is the one that cannot stand: the payment names a
		// contract no sheet holds and none of the rows before it may survive it.
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [{ name: 'Al Waha', location: 'Jeddah' }],
			units: [{ complex: 'Al Waha', name: 'B1' }],
			contracts: [],
			payments: [{ contract: 'GOV-404', date: monthsFromNow(0), amount: 100 }]
		})
	);

	assert.deepEqual(await api.transfer.get(), before);
});

test('a unit no sheet answers for is named back the way the file wrote it', async () => {
	const api = await createApi();

	// the guard behind the planning pass rather than a second one: a file reaching here with an
	// unresolvable reference has already been refused, and what this pins is that the last resort
	// still refuses it and still says which unit — as a person spelled it, not as it is keyed.
	await assert.rejects(
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [{ name: 'Al Waha', location: 'Jeddah' }],
			units: [],
			contracts: [
				{
					reference: 'GOV-7',
					tenant: '2234567890',
					units: [toUnitReference('Al Waha', 'B1')],
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 12_000
				}
			],
			payments: []
		}),
		refusedWith('workspace.unknownUnit', { name: 'Al Waha / B1' })
	);
});

// The contract domain's own rules hold at this boundary too, and this is the guard behind the
// planning pass rather than a second one: a file reaching here with a term or a cost the concept
// refuses has already been turned away per row, and what these pin is that the last resort still
// refuses it. Without them `importWhole` was the one way into the workspace that asked neither
// question, and `contract/renewal/renewal.ts` states outright that the second cannot arise through a
// router.
test('a contract worth nothing is refused here as it is everywhere else', async () => {
	const api = await createApi();

	await assert.rejects(
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [],
			units: [],
			contracts: [
				{
					reference: 'GOV-7',
					tenant: '2234567890',
					units: [],
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 0
				}
			],
			payments: []
		}),
		refusedWith('contract.costNotPositive')
	);

	assert.deepEqual(await api.contract.getMany({}), []);
});

test('a contract whose term matches no whole number of cycles is refused here too', async () => {
	const api = await createApi();

	await assert.rejects(
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [],
			units: [],
			contracts: [
				{
					reference: 'GOV-7',
					tenant: '2234567890',
					units: [],
					// a twelve-month interval over a six-month term
					start: monthsFromNow(-1),
					end: monthsFromNow(5),
					interval: '12m',
					cost: 12_000
				}
			],
			payments: []
		}),
		refusedWith('contract.periodOffCycle')
	);

	assert.deepEqual(await api.contract.getMany({}), []);
});

// A tenant and a payment go through their own concepts' rules here too. `TransferTenantSchema`
// used to be three bare strings, so the national id and phone patterns `TenantSchema` carries
// were dropped on this one path into the workspace.
//
// The Arabic-Indic case is the one worth naming: `platform/database/schema.ts` rests its
// ASCII-only search guarantee on such a value being refused on the way in, so a tenant written
// past this guard was findable by no search afterwards.
test('a tenant a file names is held to the same patterns the form is', async () => {
	const api = await createApi();
	const write = (nationalId: string, phone: string) =>
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId, phone }],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		});

	await assert.rejects(write('١٢٣٤٥٦٧٨٩٠', '+966559999999'));
	await assert.rejects(write('not-a-national-id', '+966559999999'));
	await assert.rejects(write('2234567890', 'nonsense'));

	assert.deepEqual(await api.tenant.getMany({}), []);
});

test('a payment a file names is held to the same rules the ledger is', async () => {
	const api = await createApi();

	await api.transfer.importWhole({
		tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
		complexes: [],
		units: [],
		contracts: [
			{
				reference: 'GOV-7',
				tenant: '2234567890',
				units: [],
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 12_000
			}
		],
		payments: []
	});

	const write = (amount: number, date: number) =>
		api.transfer.importWhole({
			tenants: [],
			complexes: [],
			units: [],
			contracts: [],
			payments: [{ contract: 'GOV-7', date, amount }]
		});

	await assert.rejects(write(0, monthsFromNow(0)), refusedWith('payment.amountNotPositive'));
	await assert.rejects(write(-500, monthsFromNow(0)), refusedWith('payment.amountNotPositive'));
	await assert.rejects(write(500, monthsFromNow(6)), refusedWith('payment.datedInFuture'));

	const [contract] = await api.contract.getMany({});

	assert.equal(contract.paymentCount, 0);

	// and the rule stops where it should: an ordinary payment still goes in
	await write(500, monthsFromNow(0));

	const [after] = await api.contract.getMany({});

	assert.equal(after.paymentCount, 1);
});

// The lock is the contract's rule rather than the payment's, and it is the one rule of the three
// that a file could still go around. It matters more than it looks: `payments.delete` reads the
// same lock, so a payment a file put on a terminated contract could never be taken off again.
//
// A contract this file creates cannot be locked, because `importWhole` writes every contract as
// `active` and lets reconciliation derive the rest. That is also why restoring a whole workspace
// is unaffected: a terminated contract comes back active, so its payments land on an open one.
test('a file cannot put money on a contract that has been terminated', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Omar Ali',
		nationalId: '2234567890',
		phone: '+966559999999'
	});
	const contract = await api.contract.create({
		govId: 'GOV-7',
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 12_000
	});

	await api.contract.terminate({ id: contract.id });

	const write = () =>
		api.transfer.importWhole({
			tenants: [],
			complexes: [],
			units: [],
			contracts: [],
			payments: [{ contract: 'GOV-7', date: monthsFromNow(0), amount: 500 }]
		});

	// the same refusal the ledger gives, in the same words
	await assert.rejects(write(), refusedWith('contract.terminatedLocked'));
	await assert.rejects(
		api.payment.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 500
		}),
		refusedWith('contract.terminatedLocked')
	);

	const after = await api.contract.get({ id: contract.id });

	assert.equal(after?.paidAmount, 0);

	// and the lock lifts with the termination rather than outliving it
	await api.contract.unterminate({ id: contract.id });
	await write();

	const restored = await api.contract.get({ id: contract.id });

	assert.equal(restored?.paidAmount, 500);
});

test('a duplicate identity refuses the whole write, creating nothing', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.transfer.get();

	await assert.rejects(
		api.transfer.importWhole({
			// the second tenant is fine; the first repeats a national id the workspace already
			// holds, and the write names it rather than leaving it to the unique constraint.
			tenants: [
				{ name: 'Someone Else', nationalId: '1234567890', phone: '+966500000000' },
				{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }
			],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		}),
		refusedWith('tenant.nationalIdTakenNamed', { named: '1234567890' })
	);

	assert.deepEqual(await api.transfer.get(), before);
});

// a tenant is unique on two columns, and the second one is the quiet half: a file whose rows are
// all new by national id can still carry a phone number somebody already has. Carried over from
// the tenant-only import this replaced, which asserted both.
test('a phone another tenant already holds refuses the write the same way', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.transfer.get();

	await assert.rejects(
		api.transfer.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966512345678' }],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		}),
		refusedWith('tenant.phoneTakenNamed', { named: '+966512345678' })
	);

	assert.deepEqual(await api.transfer.get(), before);
});

test('two tenants of one file sharing a phone refuse the write by that phone', async () => {
	const api = await createApi();

	await assert.rejects(
		api.transfer.importWhole({
			tenants: [
				{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' },
				{ name: 'Sara Ali', nationalId: '2234567891', phone: '+966559999999' }
			],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		}),
		refusedWith('tenant.repeatedInSet', { value: '+966559999999' })
	);

	assert.deepEqual(await api.tenant.getMany({}), []);
});

test('what the workspace holds is reported by the names a file uses', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const held = await api.transfer.held();

	assert.deepEqual(held.tenants, [['1234567890', '+966512345678']]);
	assert.deepEqual(held.complexes, ['Al Nakheel']);
	assert.deepEqual(held.units.sort(), [
		['Al Nakheel', 'A1'],
		['Al Nakheel', 'A2']
	]);
	assert.deepEqual(held.contracts, ['GOV-1']);
});

// effort 838, requirement 10: what an import compares a file with is open to every member, and a
// kind they may not view is answered as holding nothing rather than refusing the directory's import.
test('what the workspace holds leaves out a kind the member may not view', async () => {
	const db = createMemoryDatabase();

	await seedWorkspace(await createApi({ db }));

	const lacking = await createApi({
		db,
		identity: fakeIdentity({ permissions: EVERY_RECORD_ACT - 2 ** FLAGS.viewTenant })
	});
	const held = await lacking.transfer.held();

	assert.deepEqual(held.tenants, []);
	assert.deepEqual(held.complexes, ['Al Nakheel']);
	assert.deepEqual(held.contracts, ['GOV-1']);
});

test('a file read into a workspace that already holds its records adds nothing', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const written = await api.transfer.get();
	const plan = planWorkspaceImport(toTables(written), NOW, await api.transfer.held());

	// every row of it is already here, so there is nothing to agree to — which is what stops a
	// reader importing the same file twice and doubling their workspace.
	assert.equal(isWorkspaceImportable(plan), false);
});

// a directory writes into a workspace that is mostly already there, which is what makes the
// touch-set a different question than it was for a workspace read into an empty machine: a file
// of payments creates no contract at all, and the contract it moves is one that was already here.
test('payments read into a ledger move the contract they are against', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const [before] = await api.contract.getMany({});

	assert.equal(before.paidAmount, 1500);

	const plan = planWorkspaceImport(
		[
			{
				name: 'Sheet1',
				headers: ['Contract', 'Tenant', 'Payment Date', 'Amount'],
				// dated in the past, and that is now load-bearing rather than incidental: a payment
				// records money already received, so `ensurePaymentIsNotInTheFuture` refuses a
				// file carrying a future one exactly as `payments.create` refuses a typed one.
				// It only has to be a different day from the seed payment for this test's subject,
				// which is that the money and the derived column move together.
				rows: [['GOV-1', 'Abby Kris', formatDateInput(monthsFromNow(-1)), '2500']]
			}
		],
		NOW,
		await api.transfer.held(),
		['payments']
	);

	assert.ok(isWorkspaceImportable(plan));

	await api.transfer.importWhole(toInput(plan.transfer));

	const [after] = await api.contract.getMany({});

	// the criterion behind the criterion: the money moved *and* the derived column that reports it
	// moved with it. Reconciled over the contracts the payments named rather than over the ones
	// the write created, of which there were none.
	assert.equal(after.paidAmount, 4000);
	assert.equal(after.paymentCount, 2);
});

/**
 * A WORKSPACE THAT IS NOT OPEN
 *
 * Effort 846, requirement 15 at the router: the transfer procedures take `{ workspaceId }`, and a
 * workspace that is not the open one is read and written on its own database, with what the member
 * may do there. Two memory workspaces stand for them: north, open on this machine, and south, which
 * the context reaches through `databaseOf` as it would reach Turso. The identity is resolved off
 * the shell's session and the workspace it has open, as the application resolves it, so the flags
 * asked in south are the context's fold for south and not the test's.
 */
async function twoWorkspaces(south: Partial<OrganizationWorkspace> = {}) {
	const databases = { north: createMemoryDatabase(), south: createMemoryDatabase() };
	const session = fakeOrganizationSession({
		permissions: EVERY_RECORD_ACT,
		workspaces: [
			fakeOrganizationWorkspace({ id: 'north' }),
			fakeOrganizationWorkspace({ id: 'south', name: 'South Properties', ...south })
		]
	});
	const state = fakeOrganizationState({ session });
	const host = fakeHost({
		organization: { ...fakeHost().organization, getState: async () => state },
		sync: {
			...fakeHost().sync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
		}
	});
	const reached: string[] = [];
	const api = caller(appRouter)(
		await context({
			db: databases.north,
			databaseOf: (workspaceId) => {
				reached.push(workspaceId);

				return (databases as Record<string, Database>)[workspaceId];
			},
			clock: { now: () => NOW },
			host
		})
	);

	return {
		api,
		/** each workspace on its own, as a caller with it open would read it. */
		north: await createApi({ db: databases.north }),
		south: await createApi({ db: databases.south }),
		databases,
		/** every workspace the context reached on its own database rather than the open one. */
		reached
	};
}

/** a file holding one tenant, which neither workspace below holds. */
async function fileOfOneTenant() {
	const source = await createApi();

	await source.tenant.create({
		name: 'Omar Saleh',
		nationalId: '2222222222',
		phone: '+966551111111'
	});

	const plan = planWorkspaceImport(toTables(await source.transfer.get()), NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));

	return toInput(plan.transfer);
}

/** a tenant only north holds, so the two workspaces' files differ. */
async function seedNorth(north: Api) {
	await north.tenant.create({
		name: 'Nora North',
		nationalId: '1333333333',
		phone: '+966553333333'
	});
}

/** what a refusal for a flag the member lacks in the workspace named says, as a matcher. */
function forbiddenNaming(flag: string) {
	return (error: unknown) => {
		const refusal = error as { code?: string; message?: string };

		assert.equal(refusal.code, 'FORBIDDEN');
		assert.ok(refusal.message?.endsWith(`${flag} in this workspace`), refusal.message);

		return true;
	};
}

test('a workspace that is not open exports its own file, and naming none exports the open one', async () => {
	const { api, north, south, reached } = await twoWorkspaces();

	await seedWorkspace(south);
	await seedNorth(north);

	const fromSouth = await api.transfer.get({ workspaceId: 'south' });
	const fromOpen = await api.transfer.get();

	assert.deepEqual(fromSouth, await south.transfer.get());
	assert.deepEqual(fromOpen, await north.transfer.get());
	assert.deepEqual(
		fromSouth.tenants.map((tenant) => tenant.nationalId),
		['1234567890']
	);
	assert.deepEqual(
		fromOpen.tenants.map((tenant) => tenant.nationalId),
		['1333333333']
	);
	// naming the open workspace is naming nothing: it is read on the open replica.
	assert.deepEqual(await api.transfer.get({ workspaceId: 'north' }), fromOpen);
	assert.deepEqual(reached, ['south']);
});

test('an import into a workspace that is not open writes there, and the open one is untouched', async () => {
	const { api, north, south } = await twoWorkspaces();

	await seedWorkspace(south);
	await seedNorth(north);

	const northBefore = await north.transfer.get();
	const file = await fileOfOneTenant();
	let pushes = 0;

	bindSyncRequest(() => (pushes += 1));

	try {
		const imported = await api.transfer.importWhole({ workspaceId: 'south', ...file });

		assert.equal(imported.tenants, 1);
	} finally {
		bindSyncRequest(() => {});
	}

	// a write to a workspace that is not open asks no push of the open one's replica.
	assert.equal(pushes, 0);
	assert.deepEqual((await south.transfer.get()).tenants.map((tenant) => tenant.nationalId).sort(), [
		'1234567890',
		'2222222222'
	]);
	assert.deepEqual(await north.transfer.get(), northBefore);

	// what south holds is answered for south, and naming nothing still answers the open one.
	const heldInSouth = await api.transfer.held({ workspaceId: 'south' });

	assert.deepEqual(heldInSouth, await south.transfer.held());
	assert.deepEqual(heldInSouth.contracts, ['GOV-1']);
	assert.deepEqual(await api.transfer.held(), await north.transfer.held());
	assert.deepEqual((await api.transfer.held()).contracts, []);
});

test('the open workspace still asks for its push once an import lands', async () => {
	const { api } = await twoWorkspaces();
	const file = await fileOfOneTenant();
	let pushes = 0;

	bindSyncRequest(() => (pushes += 1));

	try {
		await api.transfer.importWhole(file);
	} finally {
		bindSyncRequest(() => {});
	}

	assert.equal(pushes, 1);
});

test('a read-only grant on the workspace named refuses its import while the open one imports', async () => {
	const { api, north, south } = await twoWorkspaces({ accessLevel: 'read-only' });
	const file = await fileOfOneTenant();

	await assert.rejects(
		api.transfer.importWhole({ workspaceId: 'south', ...file }),
		forbiddenNaming('createComplex, createUnit, createTenant, createContract, createPayment')
	);
	assert.deepEqual((await south.transfer.get()).tenants, []);

	// reading is not a write: the read-only workspace's file is still answered.
	assert.deepEqual(await api.transfer.get({ workspaceId: 'south' }), await south.transfer.get());

	await api.transfer.importWhole(file);

	assert.equal((await north.transfer.get()).tenants.length, 1);
});

test('a flag pinned off in the workspace named refuses there and nowhere else', async () => {
	const { api, north, south } = await twoWorkspaces({
		pinned: maskOf('createTenant'),
		granted: 0
	});
	const file = await fileOfOneTenant();

	await assert.rejects(
		api.transfer.importWhole({ workspaceId: 'south', ...file }),
		forbiddenNaming('createTenant')
	);
	assert.deepEqual((await south.transfer.get()).tenants, []);

	await api.transfer.importWhole(file);

	assert.equal((await north.transfer.get()).tenants.length, 1);
});

test('a workspace the member holds no grant on is refused, and nothing is reached', async () => {
	const { api, reached } = await twoWorkspaces();
	const file = await fileOfOneTenant();

	await assert.rejects(api.transfer.get({ workspaceId: 'west' }), refusedWith('host.noGrant'));
	await assert.rejects(api.transfer.held({ workspaceId: 'west' }), refusedWith('host.noGrant'));
	await assert.rejects(
		api.transfer.importWhole({ workspaceId: 'west', ...file }),
		refusedWith('host.noGrant')
	);
	assert.deepEqual(reached, []);
});

test('a contract whose stored status went stale exports the status it derives now', async () => {
	const { api, south, databases } = await twoWorkspaces();

	await seedWorkspace(south);

	assert.equal((await south.transfer.get()).contracts[0].status, 'active');

	// what a workspace nobody had open across a day holds: a status its term has moved on from.
	await databases.south.update(s.contract).set({ status: 'scheduled' });

	assert.equal((await south.transfer.get()).contracts[0].status, 'scheduled');
	assert.equal((await api.transfer.get({ workspaceId: 'south' })).contracts[0].status, 'active');
	// derived as it was read, never written: a read-only reader could not have written it.
	assert.equal((await south.contract.getMany({}))[0].status, 'scheduled');
});

test('a unit whose stored status went stale exports the status it derives now', async () => {
	const { api, north, south, databases } = await twoWorkspaces();

	await seedWorkspace(south);
	await seedWorkspace(north);

	const statuses = (file: WorkspaceTransfer) => file.units.map((unit) => [unit.name, unit.status]);

	assert.deepEqual(statuses(await south.transfer.get()), [
		['A1', 'occupied'],
		['A2', 'vacant']
	]);

	// what a workspace nobody had open across a day holds: statuses its contracts have moved on from.
	await databases.south.update(s.unit).set({ status: 'vacant' }).where(eq(s.unit.name, 'A1'));
	await databases.south.update(s.unit).set({ status: 'occupied' }).where(eq(s.unit.name, 'A2'));

	assert.deepEqual(statuses(await api.transfer.get({ workspaceId: 'south' })), [
		['A1', 'occupied'],
		['A2', 'vacant']
	]);
	// derived as it was read, never written: a read-only reader could not have written it.
	assert.deepEqual(statuses(await south.transfer.get()), [
		['A1', 'vacant'],
		['A2', 'occupied']
	]);

	// the open workspace's export is unchanged: reconciled on its own triggers, read as stored.
	await databases.north.update(s.unit).set({ status: 'vacant' }).where(eq(s.unit.name, 'A1'));

	assert.deepEqual(statuses(await api.transfer.get()), [
		['A1', 'vacant'],
		['A2', 'vacant']
	]);
});
