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

mock.module('svelte-sonner', { exports: { toast: { success: () => {}, error: () => {} } } });

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
const { useCreateComplex, useDeleteComplex, useCreateUnit, useUpdateUnit, useDeleteUnit } =
	await import('$lib/complex/query');
const { useCreateContract, useUpdateContract } = await import('$lib/contract/query');
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

	// the engine hands out the next id above the highest in use, so a creation after a
	// deletion takes the freed id. Reaching the deletion means undoing that creation first.
	it('does not collide when a later creation took the deleted row’s id', async () => {
		const first = await seedTenant(caller);
		const highest = await seedTenant(caller);

		await run(useDeleteTenant, highest.id);
		const replacement = await run(useCreateTenant, {
			name: 'Replacement',
			nationalId: '1999999999',
			phone: '+966559999999'
		});

		assert.equal(replacement.id, highest.id, 'the freed id is expected to be handed out again');

		await inverseStack.undo();
		await inverseStack.undo();

		assert.deepEqual(await caller.tenant.get({ id: highest.id }), highest);
		assert.deepEqual(await caller.tenant.get({ id: first.id }), first);
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
		assert.deepEqual(await caller.complex.get({ id: complex.id }), complex);

		await inverseStack.undo();
		assert.equal((await caller.complex.units.get({ id: unit.id })).name, 'A1');
	});
});
