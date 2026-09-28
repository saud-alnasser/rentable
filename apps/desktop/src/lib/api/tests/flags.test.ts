import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILT_IN, FAMILIES, WRITE_FLAGS, maskOf, type Flag } from '@rentable/workspace-permission';

import type { AnyProcedure } from '@trpc/server';

import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import type { Host } from '$lib/platform/host.ts';
import {
	fakeHost,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { appRouter } from '$lib/app/router.ts';
import { caller, context, type Meta } from '../trpc.ts';
import { createApi, fakeIdentity, NOW, unusedId } from '$lib/app/tests/testing.ts';

/**
 * EVERY PROCEDURE NAMES WHO MAY CALL IT
 *
 * Effort 838, criterion 1: a procedure that names no flag, and is not a member's own nor public,
 * is one nobody decided about. Each way of declaring a procedure records itself in its `meta`, so
 * reading the router is enough to find one.
 *
 * `_def.procedures` is typed as the nested router and holds one entry per procedure under its
 * dotted path, which is what tRPC resolves a call by; it is read as what it holds.
 */
const flat: object = appRouter._def.procedures;
const procedures = Object.entries(flat).map(([path, procedure]: [string, AnyProcedure]) => ({
	path,
	meta: (procedure._def.meta ?? {}) as Meta
}));

const namesAFlag = (meta: Meta) =>
	(meta.flags?.length ?? 0) > 0 || (meta.anyOf?.length ?? 0) > 0 || (meta.byInput?.length ?? 0) > 0;

test('every procedure names a flag, or says it is a member procedure or public', () => {
	const unnamed = procedures
		.filter(({ meta }) => !namesAFlag(meta) && !meta.member && !meta.public)
		.map(({ path }) => path);

	assert.ok(procedures.length > 100, `the walk read ${procedures.length} procedures`);
	assert.deepEqual(unnamed, [], `these name nobody who may call them: ${unnamed.join(', ')}`);
});

/** The record routers, whose every procedure is a record act. */
const RECORD_ROUTERS = ['complex.', 'tenant.', 'contract.', 'payment.', 'history.', 'workspace.'];

/**
 * The two reads open to every member, each answering with nothing of a kind the member may not
 * view rather than refusing: the landing screen, and what an import compares a file with. And this
 * machine's reconcile, a member's own act that moved under the contract router with the flat tree
 * (effort 840) and is no record act.
 */
const OPEN_TO_EVERY_MEMBER = ['dashboard.get', 'workspace.held', 'contract.reconcile'];

test('every record procedure names its flag, the open reads and the reconcile aside', () => {
	const unnamed = procedures
		.filter(({ path }) => RECORD_ROUTERS.some((prefix) => path.startsWith(prefix)))
		.filter(({ path, meta }) => !namesAFlag(meta) && !OPEN_TO_EVERY_MEMBER.includes(path))
		.map(({ path }) => path);

	assert.deepEqual(unnamed, [], `these record procedures name no flag: ${unnamed.join(', ')}`);

	for (const path of OPEN_TO_EVERY_MEMBER) {
		assert.equal(procedures.find((procedure) => procedure.path === path)?.meta.member, true, path);
	}
});

const VIEW = ['viewComplex', 'viewUnit', 'viewTenant', 'viewContract', 'viewPayment'] as const;
const CREATE = [
	'createComplex',
	'createUnit',
	'createTenant',
	'createContract',
	'createPayment'
] as const;

/**
 * The plan's map of record procedures to flags (effort 838, *Components*, "Record routers"),
 * written out so a flag that moves is a failure here rather than a quiet change of who may act.
 */
const PLANNED: Record<string, readonly Flag[]> = {
	'complex.get': ['viewComplex'],
	'complex.search': ['viewComplex'],
	'complex.getMany': ['viewComplex'],
	'complex.create': ['createComplex'],
	'complex.createMany': ['createComplex'],
	'complex.planMany': ['viewComplex'],
	'complex.update': ['editComplex'],
	'complex.delete': ['deleteComplex'],
	'complex.deleteMany': ['deleteComplex'],
	'complex.units.get': ['viewUnit'],
	'complex.units.search': ['viewUnit'],
	'complex.units.getMany': ['viewUnit'],
	'complex.units.create': ['createUnit'],
	'complex.units.createMany': ['createUnit'],
	'complex.units.planMany': ['viewUnit'],
	'complex.units.update': ['editUnit'],
	'complex.units.delete': ['deleteUnit'],
	'complex.units.deleteMany': ['deleteUnit'],
	'tenant.get': ['viewTenant'],
	'tenant.search': ['viewTenant'],
	'tenant.getMany': ['viewTenant'],
	'tenant.create': ['createTenant'],
	'tenant.createMany': ['createTenant'],
	'tenant.planMany': ['viewTenant'],
	'tenant.update': ['editTenant'],
	'tenant.delete': ['deleteTenant'],
	'tenant.deleteMany': ['deleteTenant'],
	'contract.get': ['viewContract'],
	'contract.search': ['viewContract'],
	'contract.getMany': ['viewContract'],
	'contract.reminder': ['viewContract'],
	'contract.schedule': ['viewContract'],
	'contract.create': ['createContract'],
	'contract.planMany': ['viewContract'],
	'contract.update': ['editContract'],
	'contract.renew': ['editContract'],
	'contract.terminate': ['editContract'],
	'contract.terminateMany': ['editContract'],
	'contract.unterminate': ['editContract'],
	'contract.unterminateMany': ['editContract'],
	'contract.restoreMany': ['editContract'],
	'contract.delete': ['deleteContract'],
	'contract.deleteMany': ['deleteContract'],
	'contract.units.getMany': ['viewUnit'],
	'contract.units.getAssignableMany': ['viewUnit'],
	'contract.units.getAssignableForTerm': ['viewUnit'],
	'contract.units.set': ['editContract'],
	'payment.get': ['viewPayment'],
	'payment.search': ['viewPayment'],
	'payment.getMany': ['viewPayment'],
	'payment.receipt': ['viewPayment'],
	'payment.create': ['createPayment'],
	'payment.createMany': ['createPayment'],
	'payment.planMany': ['viewPayment'],
	'payment.update': ['editPayment'],
	'payment.delete': ['deletePayment'],
	'payment.deleteMany': ['deletePayment'],
	'workspace.get': VIEW,
	'workspace.importWhole': CREATE
};

test('each record procedure names the flag the plan maps it to', () => {
	const gated = procedures.filter(({ meta }) => (meta.flags?.length ?? 0) > 0);
	const recordGated = gated.filter(({ path }) =>
		RECORD_ROUTERS.some((prefix) => path.startsWith(prefix))
	);

	assert.deepEqual(
		recordGated.map(({ path }) => path).sort(),
		Object.keys(PLANNED).sort(),
		'the procedures gated on a flag are not the ones the plan maps'
	);

	for (const { path, meta } of recordGated) {
		assert.deepEqual(meta.flags, PLANNED[path], path);
	}

	for (const path of ['history.append', 'history.getMany']) {
		assert.deepEqual(
			procedures.find((procedure) => procedure.path === path)?.meta.byInput,
			[
				...FAMILIES.complex,
				...FAMILIES.unit,
				...FAMILIES.tenant,
				...FAMILIES.contract,
				...FAMILIES.payment
			],
			path
		);
	}
});

/**
 * EACH RECORD FLAG IS REFUSED BY NAME
 *
 * Effort 838, criterion 10: for each record flag, a member holding every record act but that one
 * calls every procedure it gates and is refused naming it. The permission is asked before the
 * input is read, so no call needs an input the procedure would take.
 */

/** A procedure reached by its dotted path, as the caller would reach it by name. */
function callAt(api: unknown, path: string, input?: unknown): Promise<unknown> {
	const call = path
		.split('.')
		.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], api);

	return (call as (input?: unknown) => Promise<unknown>)(input);
}

async function refusalFrom(call: Promise<unknown>) {
	return await call.then(
		() => null,
		(error: unknown) => error as { code?: string; message?: string }
	);
}

const RECORD_FLAGS: readonly Flag[] = [
	...FAMILIES.complex,
	...FAMILIES.unit,
	...FAMILIES.tenant,
	...FAMILIES.contract,
	...FAMILIES.payment
];

const without = (flag: Flag) => maskOf(...RECORD_FLAGS.filter((held) => held !== flag));

test('a member lacking a record flag is refused, by its name, every procedure it gates', async () => {
	for (const flag of RECORD_FLAGS) {
		const api = await createApi({ identity: fakeIdentity({ permissions: without(flag) }) });
		const gatedOnIt = procedures.filter(({ meta }) => meta.flags?.includes(flag));

		assert.ok(gatedOnIt.length > 0, `no procedure is gated on ${flag}`);

		for (const { path } of gatedOnIt) {
			const refusal = await refusalFrom(callAt(api, path));

			assert.equal(refusal?.code, 'FORBIDDEN', `${path} without ${flag}`);
			assert.ok(
				refusal?.message?.endsWith(`${flag} in this workspace`),
				`${path} refused without naming ${flag}: ${refusal?.message}`
			);
		}
	}
});

test('holding the flag is the whole of what changes the answer', async () => {
	const holding = await createApi();
	const lacking = await createApi({
		identity: fakeIdentity({ permissions: without('viewTenant') })
	});

	assert.deepEqual(await holding.tenant.search({ term: 'nobody' }), []);
	assert.equal((await refusalFrom(lacking.tenant.search({ term: 'nobody' })))?.code, 'FORBIDDEN');
});

// a complex entered with units adds them as units, so the create asks createUnit where it carries
// any, and not where it carries none.
test('a complex created with units asks for createUnit as well', async () => {
	const lacking = await createApi({
		identity: fakeIdentity({ permissions: without('createUnit') })
	});
	const refusal = await refusalFrom(
		lacking.complex.create({ name: 'north', location: 'riyadh', units: [{ name: 'a1' }] })
	);

	assert.equal(refusal?.code, 'FORBIDDEN');
	assert.ok(refusal?.message?.includes('createUnit'), refusal?.message);
	assert.deepEqual(await lacking.complex.search({ term: 'north' }), []);

	await lacking.complex.create({ name: 'north', location: 'riyadh' });
});

test('the history asks for the flag of the record and the act an entry is about', async () => {
	const entry = {
		concept: 'payment' as const,
		recordId: unusedId(),
		action: 'deleted',
		record: 'a payment'
	};

	const lacking = await createApi({
		identity: fakeIdentity({ permissions: without('deletePayment') })
	});
	const appending = await refusalFrom(lacking.history.append({ entries: [entry] }));

	assert.equal(appending?.code, 'FORBIDDEN');
	assert.ok(appending?.message?.endsWith('deletePayment in this workspace'), appending?.message);

	// the same member records an edit of the payment, which they may make.
	await lacking.history.append({ entries: [{ ...entry, action: 'edited' }] });

	// and reading a record's history is viewing that kind.
	const blind = await createApi({ identity: fakeIdentity({ permissions: without('viewTenant') }) });
	const reading = await refusalFrom(
		blind.history.getMany({ concept: 'tenant', recordId: entry.recordId })
	);

	assert.equal(reading?.code, 'FORBIDDEN');
	assert.ok(reading?.message?.endsWith('viewTenant in this workspace'), reading?.message);
	// the kinds they do view are read as before.
	assert.deepEqual(
		await blind.history.getMany({ concept: 'payment', recordId: entry.recordId }),
		[]
	);
});

/**
 * ON A READ-ONLY GRANT
 *
 * Effort 838, criterion 10: whatever the role says, a member on a read-only grant is refused every
 * create, edit and delete. The identity here is resolved the way the application resolves it, off
 * the shell's session and the workspace it has open, so the fold is the context's and not the
 * test's.
 */
function managerOnReadOnly(): Host {
	const session = fakeOrganizationSession({
		role: 'manager',
		roleId: BUILT_IN.manager.id,
		rank: BUILT_IN.manager.rank,
		permissions: BUILT_IN.manager.mask,
		workspaces: [fakeOrganizationWorkspace({ id: 'north', accessLevel: 'read-only' })]
	});
	const state = fakeOrganizationState({ session });

	return fakeHost({
		organization: { ...fakeHost().organization, getState: async () => state },
		remoteSync: {
			...fakeHost().remoteSync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
		}
	});
}

test('on a read-only grant every create, edit and delete is refused', async () => {
	const api = caller(appRouter)(
		await context({
			db: createMemoryDatabase(),
			clock: { now: () => NOW },
			host: managerOnReadOnly()
		})
	);
	const writes = procedures.filter(({ meta }) =>
		meta.flags?.some((flag) => WRITE_FLAGS.includes(flag))
	);

	assert.ok(writes.length > 30, `the walk found ${writes.length} writes`);

	for (const { path } of writes) {
		const refusal = await refusalFrom(callAt(api, path));

		assert.equal(refusal?.code, 'FORBIDDEN', `${path} on a read-only grant`);
	}

	for (const action of ['created', 'edited', 'deleted']) {
		const refusal = await refusalFrom(
			api.history.append({
				entries: [{ concept: 'tenant', recordId: unusedId(), action, record: 'a tenant' }]
			})
		);

		assert.equal(refusal?.code, 'FORBIDDEN', `recording ${action} on a read-only grant`);
	}

	// and reading is not a write: the same member lists what the workspace holds.
	assert.deepEqual(await api.tenant.search({ term: 'nobody' }), []);
});

/**
 * TAILORED FOR ONE WORKSPACE
 *
 * Effort 838, criterion 12 as amended a third time: a record procedure answers by what the member
 * may do in the workspace open, which is what they may do across the organization with what is
 * pinned for them there. A manager with adding complexes pinned off in north, and viewing tenants
 * with everything viewing them is needed for, is refused both in north and neither in south,
 * where nothing is pinned. The identity is resolved off the shell's session and the workspace it
 * has open, so the pins are the context's and not the test's.
 */
function managerTailoredIn(open: string): Host {
	const session = fakeOrganizationSession({
		role: 'manager',
		roleId: BUILT_IN.manager.id,
		rank: BUILT_IN.manager.rank,
		permissions: BUILT_IN.manager.mask,
		workspaces: [
			fakeOrganizationWorkspace({
				id: 'north',
				pinned: maskOf('createComplex', ...FAMILIES.tenant),
				granted: 0
			}),
			fakeOrganizationWorkspace({ id: 'south' })
		]
	});
	const state = fakeOrganizationState({ session });

	return fakeHost({
		organization: { ...fakeHost().organization, getState: async () => state },
		remoteSync: {
			...fakeHost().remoteSync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: open }) })
		}
	});
}

test('a record procedure answers by what is pinned for the member in the workspace open', async () => {
	const inNorth = caller(appRouter)(
		await context({
			db: createMemoryDatabase(),
			clock: { now: () => NOW },
			host: managerTailoredIn('north')
		})
	);
	const adding = await refusalFrom(inNorth.complex.create({ name: 'north', location: 'riyadh' }));
	const reading = await refusalFrom(inNorth.tenant.search({ term: 'nobody' }));

	assert.equal(adding?.code, 'FORBIDDEN');
	assert.ok(adding?.message?.endsWith('createComplex in this workspace'), adding?.message);
	assert.equal(reading?.code, 'FORBIDDEN');
	assert.ok(reading?.message?.endsWith('viewTenant in this workspace'), reading?.message);
	// what north does not switch stays as the organization has it.
	assert.deepEqual(await inNorth.complex.search({ term: 'nobody' }), []);

	const inSouth = caller(appRouter)(
		await context({
			db: createMemoryDatabase(),
			clock: { now: () => NOW },
			host: managerTailoredIn('south')
		})
	);

	await inSouth.complex.create({ name: 'south', location: 'riyadh' });
	assert.deepEqual(await inSouth.tenant.search({ term: 'nobody' }), []);
});
