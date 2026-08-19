import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '$lib/api/testing.mjs';

// The declarations live beside the query hooks, which reach `.svelte` files this harness
// cannot load. Substituting the three dependencies leaves the declaration itself real: the
// procedures it calls are the ones a typed action goes through, over an in-memory database.
let caller;

mock.module('$lib/api/caller', {
	exports: {
		default: new Proxy({}, { get: (_, concept) => caller[concept] })
	}
});

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({ invalidateQueries: async () => {} }),
		createMutation: (options) => options(),
		createQuery: () => ({})
	}
});

mock.module('svelte-sonner', {
	exports: { toast: { success: () => {}, error: () => {}, dismiss: () => {} } }
});

// the remote is the one thing that cannot be real here: it is a process boundary. What it
// reports is all the sync path reads, so the pull below is the pull the application takes.
let remoteOutcome = { state: {}, action: 'none', preparation: null };

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			remoteSync: {
				getState: async () => remoteOutcome.state,
				autosaveNow: async () => remoteOutcome.state,
				googleDrive: { sync: async () => remoteOutcome }
			}
		}
	}
});

const { inverseStack } = await import('$lib/design/inverse');
const { useCreateTenant, useUpdateTenant, useDeleteTenant } = await import('$lib/tenant/query');
const {
	useCreateComplex,
	useUpdateComplex,
	useDeleteComplex,
	useCreateUnit,
	useUpdateUnit,
	useDeleteUnit
} = await import('$lib/complex/query');
const {
	useCreateContract,
	useUpdateContract,
	useRenewContract,
	useSetContractUnits,
	useTerminateContract,
	useUnterminateContract
} = await import('$lib/contract/query');
const { getContractRenewalTerm } = await import('$lib/contract/renewal');
const { useCreatePayment, useDeletePayment } = await import('$lib/payment/query');
const { syncWorkspaceNow } = await import('$lib/sync/workspace');

/**
 * Drive one declared mutation the way the query client does — capture, call, then settle —
 * so what the test exercises is the declaration rather than a transcription of it.
 */
async function run(hook, variables) {
	const mutation = hook();
	const captured = await mutation.onMutate?.(variables);
	const result = await mutation.mutationFn(variables);

	await mutation.onSuccess(result, variables, captured);

	return result;
}

beforeEach(async () => {
	inverseStack.clear();
	caller = await createApi();
});

describe('undoing a record change', () => {
	it('takes back a creation, and applies it again with the identity it had', async () => {
		const tenant = await run(useCreateTenant, {
			name: 'Sara',
			nationalId: '1234567890',
			phone: '+966551234567'
		});

		await inverseStack.undo();
		assert.equal(await caller.tenant.get({ id: tenant.id }), undefined);

		await inverseStack.redo();
		assert.deepEqual(await caller.tenant.get({ id: tenant.id }), tenant);
	});

	it('takes back an edit, restoring what the row held', async () => {
		const tenant = await seedTenant(caller);

		await run(useUpdateTenant, { id: tenant.id, name: 'Renamed' });
		assert.equal((await caller.tenant.get({ id: tenant.id })).name, 'Renamed');

		await inverseStack.undo();
		assert.equal((await caller.tenant.get({ id: tenant.id })).name, tenant.name);

		await inverseStack.redo();
		assert.equal((await caller.tenant.get({ id: tenant.id })).name, 'Renamed');
	});

	it('takes back a deletion, putting the row back with the identity it had', async () => {
		const tenant = await seedTenant(caller);

		await run(useDeleteTenant, tenant.id);
		assert.equal(await caller.tenant.get({ id: tenant.id }), undefined);

		await inverseStack.undo();
		assert.deepEqual(await caller.tenant.get({ id: tenant.id }), tenant);
	});

	// This used to assert the opposite. The engine handed out the next id above the highest
	// in use, so a creation after a deletion took the freed id and an undo had to reach past
	// it. A client-minted identity is nobody's second choice, so the collision is gone — and
	// what is asserted is that it is gone, since a test deleted outright would leave the
	// undo path looking untested for a hazard that was real until this release.
	it('does not hand a deleted row’s identity to the next creation', async () => {
		const first = await seedTenant(caller);
		const deleted = await seedTenant(caller);

		await run(useDeleteTenant, deleted.id);
		const replacement = await run(useCreateTenant, {
			name: 'Replacement',
			nationalId: '1999999999',
			phone: '+966559999999'
		});

		assert.notEqual(replacement.id, deleted.id, 'a freed identity is not handed out again');

		await inverseStack.undo();
		await inverseStack.undo();

		assert.deepEqual(await caller.tenant.get({ id: deleted.id }), deleted);
		assert.deepEqual(await caller.tenant.get({ id: first.id }), first);
	});

	// and the guard that collision justified is still load-bearing, because a caller may
	// state an identity — which is how an undo puts a row back as the record it was.
	it('refuses a stated identity another record already holds', async () => {
		const held = await seedTenant(caller);

		await assert.rejects(
			() =>
				caller.tenant.create({
					id: held.id,
					name: 'Impostor',
					nationalId: '1999999999',
					phone: '+966559999999'
				}),
			/another record already holds that id/
		);
	});

	// Another device is the only thing that can take a row away between this session editing it
	// and undoing that edit — [[rules/data]], under *Undo*. The delete below goes through the
	// procedure directly rather than through a declaration, which is what makes it somebody
	// else's: nothing about it reaches this stack.
	it('refuses to take back an edit whose row somebody else deleted, and says so', async () => {
		const tenant = await seedTenant(caller);

		await run(useUpdateTenant, { id: tenant.id, name: 'Renamed' });
		await caller.tenant.delete({ id: tenant.id });

		await assert.rejects(() => inverseStack.undo(), /no longer in the workspace/);

		assert.equal(
			await caller.tenant.get({ id: tenant.id }),
			undefined,
			'the row stays deleted: an undo that recreated it would resurrect a record somebody removed'
		);
		assert.ok(inverseStack.undoable, 'the inverse stays, so the user can see what failed');
	});

	it('refuses the same way for a complex and for a unit', async () => {
		const complex = await run(useCreateComplex, { name: 'Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'A1', complexId: complex.id });

		await run(useUpdateUnit, { id: unit.id, complexId: complex.id, name: 'A2' });
		await caller.complex.units.delete({ id: unit.id });

		await assert.rejects(() => inverseStack.undo(), /no longer in the workspace/);

		inverseStack.clear();

		await run(useUpdateComplex, { id: complex.id, name: 'Renamed' });
		await caller.complex.delete({ id: complex.id });

		await assert.rejects(() => inverseStack.undo(), /no longer in the workspace/);
	});

	it('takes back a complex, a unit, a contract and a payment alike', async () => {
		const complex = await run(useCreateComplex, { name: 'Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'A1', complexId: complex.id });
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const payment = await run(useCreatePayment, {
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await run(useDeletePayment, payment.id);
		await inverseStack.undo();
		assert.equal((await caller.contract.payments.get({ id: payment.id })).amount, 1000);

		await run(useUpdateUnit, { id: unit.id, complexId: complex.id, name: 'A2' });
		await inverseStack.undo();
		assert.equal((await caller.complex.units.get({ id: unit.id })).name, 'A1');

		await run(useUpdateContract, {
			id: contract.id,
			tenantId: tenant.id,
			govId: 'GOV-9',
			start: contract.start,
			end: contract.end,
			interval: contract.interval,
			cost: 2000
		});
		await inverseStack.undo();
		assert.equal((await caller.contract.get({ id: contract.id })).cost, 1000);
	});

	// the two changes that are not row-shaped: what a contract holds, and whether it stands.
	it('restores exactly the set of units the contract held, across complexes', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const one = await caller.complex.create({ name: 'Coral Tower', location: 'Jeddah' });
		const other = await caller.complex.create({ name: 'Palm Court', location: 'Riyadh' });
		const first = await caller.complex.units.create({ name: 'A1', complexId: one.id });
		const second = await caller.complex.units.create({ name: 'B2', complexId: other.id });
		const third = await caller.complex.units.create({ name: 'C3', complexId: other.id });

		const heldIds = async () =>
			(await caller.contract.units.getMany({ contractId: contract.id }))
				.map((unit) => unit.id)
				.sort();

		await run(useSetContractUnits, {
			contractId: contract.id,
			unitIds: [first.id, second.id]
		});
		await run(useSetContractUnits, { contractId: contract.id, unitIds: [third.id] });

		await inverseStack.undo();
		assert.deepEqual(await heldIds(), [first.id, second.id].sort());

		await inverseStack.redo();
		assert.deepEqual(await heldIds(), [third.id]);
	});

	// a renewal is a creation, and is taken back like one — the successor arrives holding units,
	// so the inverse empties it before deleting it, and putting it back restores those units.
	it('takes back a renewal, and applies it again with the identity it had', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const complex = await caller.complex.create({ name: 'Renewal Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'R1', complexId: complex.id });

		await caller.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

		const term = getContractRenewalTerm(contract);
		const successor = await run(useRenewContract, {
			contractId: contract.id,
			start: term.start.getTime(),
			end: term.end.getTime()
		});

		await inverseStack.undo();
		assert.equal(await caller.contract.get({ id: successor.id }), undefined);
		// the contract that was renewed is untouched by the renewal and by taking it back.
		assert.deepEqual(await caller.contract.get({ id: contract.id }), contract);
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);

		await inverseStack.redo();
		assert.deepEqual(await caller.contract.get({ id: successor.id }), successor);
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: successor.id })).map((held) => held.id),
			[unit.id]
		);
	});

	it('reinstates a terminated contract through the procedure that exists for it', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await run(useTerminateContract, contract.id);
		assert.equal((await caller.contract.get({ id: contract.id })).status, 'terminated');

		await inverseStack.undo();
		const reinstated = await caller.contract.get({ id: contract.id });

		assert.notEqual(reinstated.status, 'terminated');

		await inverseStack.redo();
		assert.equal((await caller.contract.get({ id: contract.id })).status, 'terminated');
	});

	it('takes back reinstating a contract as readily as terminating one', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await caller.contract.terminate({ id: contract.id });
		await run(useUnterminateContract, contract.id);

		await inverseStack.undo();
		assert.equal((await caller.contract.get({ id: contract.id })).status, 'terminated');

		await inverseStack.redo();
		assert.notEqual((await caller.contract.get({ id: contract.id })).status, 'terminated');
	});

	// what the control offers before it is used, in the words the user reads.
	it('names the change each inverse would take back', async () => {
		const translations = {
			common: {
				labels: { contract: () => 'contract' },
				undo: {
					assigned: ({ record }) => `changing the units of ${record}`,
					terminated: ({ record }) => `terminating ${record}`,
					unterminated: ({ record }) => `restoring ${record}`
				}
			}
		};
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await run(useSetContractUnits, { contractId: contract.id, unitIds: [] });
		assert.equal(inverseStack.undoable.describe(translations), 'changing the units of contract');

		await run(useTerminateContract, contract.id);
		assert.equal(inverseStack.undoable.describe(translations), 'terminating contract');

		await run(useUnterminateContract, contract.id);
		assert.equal(inverseStack.undoable.describe(translations), 'restoring contract');
	});

	it('cannot apply a set-shaped inverse once the remote has replaced the workspace', async () => {
		const linked = {
			googleDriveReady: true,
			workspace: { id: 'workspace-1', provider: 'googleDrive', accountId: 'account-1' }
		};
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const complex = await caller.complex.create({ name: 'Coral Tower', location: 'Jeddah' });
		const unit = await caller.complex.units.create({ name: 'A1', complexId: complex.id });

		await run(useSetContractUnits, { contractId: contract.id, unitIds: [unit.id] });
		await run(useTerminateContract, contract.id);

		remoteOutcome = { state: linked, action: 'pulled', preparation: null };
		await syncWorkspaceNow(linked);

		assert.equal(inverseStack.undoable, null);
		assert.equal(await inverseStack.undo(), null);
	});

	// a complex created with its units is the one creation whose inverse is not a single
	// delete: a complex still holding units refuses to be deleted.
	it('takes back a complex created with its units, and puts them all back', async () => {
		const complex = await run(useCreateComplex, {
			name: 'Palm Court',
			location: 'Riyadh',
			units: [{ name: 'A1' }, { name: 'A2' }]
		});

		await inverseStack.undo();
		assert.equal(await caller.complex.get({ id: complex.id }), undefined);
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), []);

		await inverseStack.redo();
		assert.equal((await caller.complex.get({ id: complex.id })).name, 'Palm Court');
		assert.deepEqual(
			(await caller.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.id),
			complex.units.map((unit) => unit.id)
		);
	});

	// the risk this whole design carries: an inverse is a statement about a database, and the
	// remote can replace that database underneath the running session.
	it('can apply nothing once the remote has replaced the workspace', async () => {
		const linked = {
			googleDriveReady: true,
			workspace: { id: 'workspace-1', provider: 'googleDrive', accountId: 'account-1' }
		};

		const tenant = await run(useCreateTenant, {
			name: 'Sara',
			nationalId: '1234567890',
			phone: '+966551234567'
		});

		assert.ok(inverseStack.undoable, 'the creation left nothing to take back');

		remoteOutcome = { state: linked, action: 'pulled', preparation: null };
		await syncWorkspaceNow(linked);

		assert.equal(inverseStack.undoable, null);
		assert.equal(await inverseStack.undo(), null);
		assert.ok(
			await caller.tenant.get({ id: tenant.id }),
			'the row is expected to survive: nothing was undone, the stack was emptied'
		);
	});

	it('leaves a complex and a unit reachable again after their deletions are taken back', async () => {
		const complex = await run(useCreateComplex, { name: 'Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'A1', complexId: complex.id });

		await run(useDeleteUnit, unit.id);
		await run(useDeleteComplex, complex.id);

		await inverseStack.undo();
		// creation answers with the units it made as well, so the row is compared rather than
		// the whole answer.
		const { units, ...row } = complex;

		assert.deepEqual(units, []);
		assert.deepEqual(await caller.complex.get({ id: complex.id }), row);

		await inverseStack.undo();
		assert.equal((await caller.complex.units.get({ id: unit.id })).name, 'A1');
	});
});
