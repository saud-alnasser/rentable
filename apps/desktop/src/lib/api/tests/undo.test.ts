import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { CreateMutationResult } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

import {
	type Api,
	createApi,
	identityWithout,
	monthsFromNow,
	seedTenant,
	refusedWith
} from '$lib/app/tests/testing.ts';
import { bindingOf } from '#tests/mutation.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';

// The declarations live beside the query hooks, which reach `.svelte` files this harness
// cannot load. Substituting the three dependencies leaves the declaration itself real: the
// procedures it calls are the ones a typed action goes through, over an in-memory database.
//
// The caller is rebound before every test, so the substitute reads it through a proxy rather
// than closing over the one this file started with.
let caller: Api = await createApi();

/** every batch of entries an account was asked to append, oldest first. */
const appended: Parameters<Api['history']['append']>[0]['entries'][] = [];

mock.module('$lib/api/caller', {
	exports: {
		default: new Proxy(caller, {
			get: (_target, concept) =>
				// the account is written without being awaited, so what it was asked to write is
				// watched at the call rather than read back from the table.
				concept === 'history'
					? {
							...caller.history,
							append: (input: Parameters<Api['history']['append']>[0]) => {
								appended.push(input.entries);

								return caller.history.append(input);
							}
						}
					: Reflect.get(caller, concept)
		})
	}
});

/** the query keys the client was asked to refresh, newest last. */
const refreshed: (readonly unknown[] | undefined)[] = [];

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({
			invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
				refreshed.push(filters?.queryKey);
			}
		}),
		createMutation: (options: () => unknown) => options(),
		createQuery: () => ({})
	}
});

mock.module('svelte-sonner', {
	exports: { toast: { success: () => {}, error: () => {}, dismiss: () => {} } }
});

// the remote is the one thing that cannot be real here: it is a process boundary, and what it
// reports is all the sync path reads.
const remoteState = { state: fakeSyncState() };

mock.module('$lib/sync/tauri', {
	exports: {
		tauri: {
			getState: async () => remoteState.state
		}
	}
});

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			// a failed undo is recorded for diagnostics; what it records is not asserted here.
			diagnostics: { write: async () => {} }
		}
	}
});

const { inverseStack } = await import('$lib/undo/undo');
const { applyUndo } = await import('$lib/undo');
const { prefixOf } = await import('$lib/mutation');
const { useQueryClient } = await import('@tanstack/svelte-query');
const { useCreateTenant, useUpdateTenant, useDeleteTenant, useDeleteManyTenants } =
	await import('$lib/tenant/query');
const { useCreateComplex, useUpdateComplex, useDeleteComplex, useDeleteManyComplexes } =
	await import('$lib/complex/query');
const { useCreateUnit, useCreateManyUnits, useUpdateUnit, useDeleteUnit, useDeleteManyUnits } =
	await import('$lib/complex/unit/query');
const {
	useCreateContract,
	useDeleteContract,
	useUpdateContract,
	useSetContractUnits,
	useTerminateContract,
	useUnterminateContract
} = await import('$lib/contract/query');
const { useRenewContract } = await import('$lib/contract/renewal/query');
const { getContractRenewalTerm } = await import('$lib/contract/renewal/renewal');
const { useDeleteManyContracts } = await import('$lib/contract/selection/query');
const { useCreatePayment, useUpdatePayment, useDeletePayment, useDeleteManyPayments } =
	await import('$lib/payment/query');
const { memberPermissions } = await import('$lib/permission');
const { EVERY_FLAG, maskOf } = await import('@rentable/workspace-permission');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { LL, setLocale } = await import('$lib/i18n/i18n-svelte');

// the cache policy the root layout provides, built from the features' declarations: a settled
// mutation invalidates by it.
await import('$lib/app/cache');

// an inverse names itself in the reader's language, so what a control would offer is only
// assertable once a locale is loaded — the same two calls the application makes at startup.
loadLocale('en');
setLocale('en');

/**
 * Drive one declared mutation the way the query client does — capture, call, then settle —
 * so what the test exercises is the declaration rather than a transcription of it.
 *
 * The hook's declared type is the real query library's result, which is not what it answers
 * with here — the library is substituted above, and what comes back is the binding
 * `declareMutation` handed it. That type still says which variables and which result, which is
 * what keeps every call below typed by the procedure it declared.
 */
async function run<TVariables, TResult, TCaptured>(
	hook: () => CreateMutationResult<TResult, Error, TVariables, TCaptured>,
	variables: TVariables
): Promise<TResult> {
	const mutation = bindingOf(hook);
	const captured = await mutation.onMutate?.(variables);
	const result = await mutation.mutationFn(variables);

	await mutation.onSuccess(result, variables, captured);

	return result;
}

/**
 * a contract as its own read answers with it, less the reference a workspace file calls it by, its
 * tenant's name and whether it is renewed: a mutation's answer carries none of them, and what these
 * tests compare is the record itself. Whether it is renewed is read off its successors, and a test
 * about it asks the read itself.
 */
async function readContract(id: string) {
	const read = await caller.contract.get({ id });

	if (!read) {
		return read;
	}

	const { reference, tenantName, renewed, ...contract } = read;

	assert.equal(typeof renewed, 'boolean', 'a contract read says whether it is renewed');

	assert.ok(reference, 'a contract read names the reference a file calls it by');
	assert.ok(tenantName, 'a contract read names its tenant to a reader who may see tenants');

	return contract;
}

beforeEach(async () => {
	inverseStack.clear();
	caller = await createApi();
	appended.length = 0;
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
		assert.equal((await caller.tenant.get({ id: tenant.id }))?.name, 'Renamed');

		await inverseStack.undo();
		assert.equal((await caller.tenant.get({ id: tenant.id }))?.name, tenant.name);

		await inverseStack.redo();
		assert.equal((await caller.tenant.get({ id: tenant.id }))?.name, 'Renamed');
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
			refusedWith('record.idTaken')
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

		await assert.rejects(() => inverseStack.undo(), refusedWith('tenant.gone'));

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

		await assert.rejects(() => inverseStack.undo(), refusedWith('unit.gone'));

		inverseStack.clear();

		await run(useUpdateComplex, { id: complex.id, name: 'Renamed' });
		await caller.complex.delete({ id: complex.id });

		await assert.rejects(() => inverseStack.undo(), refusedWith('complex.gone'));
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
		assert.equal((await caller.payment.get({ id: payment.id }))?.amount, 1000);

		await run(useUpdateUnit, { id: unit.id, complexId: complex.id, name: 'A2' });
		await inverseStack.undo();
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.name, 'A1');

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
		assert.equal((await caller.contract.get({ id: contract.id }))?.cost, 1000);
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
	// so the inverse empties it before deleting it, and putting it back restores those units. It is
	// renewed at a new rent, and applied again it names the contract it renews and holds that rent
	// under the same identity (effort 861, criterion 5).
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
			end: term.end.getTime(),
			cost: 1200
		});

		assert.equal(successor.renewsContractId, contract.id);
		assert.equal(successor.cost, 1200);

		await inverseStack.undo();
		assert.equal(await caller.contract.get({ id: successor.id }), undefined);
		// the contract that was renewed is untouched by the renewal and by taking it back. Its read
		// also carries the rank it is filed under today: begun a month ago and unpaid, it owes.
		assert.deepEqual(await readContract(contract.id), {
			...contract,
			rank: 'owing'
		});
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);
		// with its renewal taken back nothing renews it, and applied again its renewal does
		// (effort 861, requirement 7).
		assert.equal((await caller.contract.get({ id: contract.id }))?.renewed, false);

		await inverseStack.redo();
		assert.equal((await caller.contract.get({ id: contract.id }))?.renewed, true);
		assert.deepEqual(await readContract(successor.id), successor);
		assert.equal((await readContract(successor.id))?.renewsContractId, contract.id);
		assert.equal((await readContract(successor.id))?.cost, 1200);
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: successor.id })).map((held) => held.id),
			[unit.id]
		);
	});

	// a contract created holding units is taken back whole: the inverse empties it and deletes it,
	// and applying it again creates both (effort 832, requirement 20).
	it('takes back a contract created with its units, leaving neither, and applies both again', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({ name: 'Creation Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'C1', complexId: complex.id });
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000,
			unitIds: [unit.id]
		});

		await inverseStack.undo();
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);
		assert.deepEqual(await caller.contract.getMany({ unitId: unit.id }), []);

		await inverseStack.redo();
		// read with the rank it is filed under today: begun a month ago and unpaid, it owes.
		assert.deepEqual(await readContract(contract.id), {
			...contract,
			rank: 'owing'
		});
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);
	});

	// ticket 41: the inverse is the one deletion, which releases the units in the same batch. No
	// second call means no undo that stops halfway, with the units released and the contract
	// standing.
	it('takes back a contract creation with the one deletion, and nothing else', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({ name: 'Single Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'S1', complexId: complex.id });
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000,
			unitIds: [unit.id]
		});
		const real = caller;
		const called: string[] = [];

		// every contract procedure the undo reaches, the unit procedures included, by its path.
		const recording = (procedures: object, path: string): object =>
			new Proxy(procedures, {
				get: (target, name) => {
					const value = Reflect.get(target, name);
					const named = `${path}.${String(name)}`;

					if (typeof value === 'function') {
						return (...args: unknown[]) => {
							called.push(named);

							return value(...args);
						};
					}

					return value && typeof value === 'object' ? recording(value, named) : value;
				}
			});

		caller = new Proxy(real, {
			get: (target, concept) =>
				concept === 'contract'
					? recording(target.contract, 'contract')
					: Reflect.get(target, concept)
		});

		try {
			await inverseStack.undo();
		} finally {
			caller = real;
		}

		assert.deepEqual(called, ['contract.delete']);
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.status, 'vacant');
	});

	// ticket 38, narrowed by ticket 41: an undo that fails still refreshes what it touched, and the
	// entry stays to be pressed again. The deletion is one batch, so the failure leaves the contract
	// whole, holding its units, rather than half taken back.
	it('refreshes what a contract creation’s undo touched when it fails, leaving the contract whole', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({ name: 'Halfway Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'H1', complexId: complex.id });
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000,
			unitIds: [unit.id]
		});
		const entry = inverseStack.undoable;
		const real = caller;

		// the deletion fails, as a lost connection would fail it.
		caller = new Proxy(real, {
			get: (target, concept) =>
				concept === 'contract'
					? new Proxy(target.contract, {
							get: (procedures, name) =>
								name === 'delete'
									? async () => {
											throw new Error('the connection was lost');
										}
									: Reflect.get(procedures, name)
						})
					: Reflect.get(target, concept)
		});
		refreshed.length = 0;

		try {
			await applyUndo(useQueryClient());
		} finally {
			caller = real;
		}

		for (const prefix of [prefixOf('contract'), prefixOf('unit')]) {
			assert.ok(
				refreshed.some((key) => JSON.stringify(key) === JSON.stringify(prefix)),
				`${JSON.stringify(prefix)} was not refreshed after the undo failed`
			);
		}
		assert.equal(inverseStack.undoable, entry);
		assert.ok(await caller.contract.get({ id: contract.id }));
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);

		// pressed again, it finishes.
		await applyUndo(useQueryClient());
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);
	});

	// ticket 41: a deletion is taken back by restoring the rows, so a terminated contract comes
	// back terminated, holding its unit even where another contract took it since.
	it('takes back deleting a terminated contract, restoring it as it was', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({ name: 'Restore Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'R1', complexId: complex.id });
		const term = {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m' as const,
			cost: 1000,
			unitIds: [unit.id]
		};
		const contract = await caller.contract.create(term);

		await caller.contract.terminate({ id: contract.id });
		await run(useDeleteContract, contract.id);

		const other = await caller.contract.create(term);

		await inverseStack.undo();

		assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: other.id })).map((held) => held.id),
			[unit.id]
		);

		// and applied again, it deletes the contract it restored.
		await inverseStack.redo();
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);
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
		assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');

		await inverseStack.undo();
		const reinstated = await caller.contract.get({ id: contract.id });

		// the row first, then its status: `notEqual` is satisfied by a contract that is not there
		// at all, and "the contract came back" is the whole of what this test is about.
		assert.ok(reinstated, 'the contract was not put back');
		assert.notEqual(reinstated.status, 'terminated');

		await inverseStack.redo();
		assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');
	});

	// effort 854, requirement 4: undoing a terminate makes the contract live again, so it is
	// refused where another contract took one of its units since, and the entry stays to be
	// pressed again once the unit is freed.
	it('refuses taking back a termination once another contract took the unit, keeping the entry', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({ name: 'Taken Tower', location: 'Riyadh' });
		const unit = await caller.complex.units.create({ name: 'T1', complexId: complex.id });
		const term = {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m' as const,
			cost: 1000,
			unitIds: [unit.id]
		};
		const contract = await caller.contract.create(term);

		await run(useTerminateContract, contract.id);

		const entry = inverseStack.undoable;

		await caller.contract.create(term);

		await assert.rejects(
			() => inverseStack.undo(),
			refusedWith('contract.unitsTakenNamed', { named: 'Taken Tower / T1' })
		);
		assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');
		assert.equal(inverseStack.undoable, entry);
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
		assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');

		await inverseStack.redo();
		const reinstated = await caller.contract.get({ id: contract.id });

		// as above: a contract that is gone would satisfy `notEqual` and say nothing.
		assert.ok(reinstated, 'the contract was not put back');
		assert.notEqual(reinstated.status, 'terminated');
	});

	// what the control offers before it is used, in the words the user reads.
	it('names the change each inverse would take back', async () => {
		// the loaded locale rather than a hand-written stand-in: `describe` takes the whole of
		// `TranslationFunctions`, and the three-key object this used to pass was a shape nothing
		// ever hands it. English says the same words, so what is asserted is unchanged.
		const translations = get(LL);
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await run(useSetContractUnits, { contractId: contract.id, unitIds: [] });
		assert.equal(inverseStack.undoable?.describe(translations), 'changing the units of contract');

		await run(useTerminateContract, contract.id);
		assert.equal(inverseStack.undoable?.describe(translations), 'terminating contract');

		await run(useUnterminateContract, contract.id);
		assert.equal(inverseStack.undoable?.describe(translations), 'restoring contract');
	});

	// a complex created with its units is the one creation whose inverse is not a single
	// delete: the units it made go first, each through its own delete.
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
		assert.equal((await caller.complex.get({ id: complex.id }))?.name, 'Palm Court');
		assert.deepEqual(
			(await caller.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.id),
			complex.units.map((unit) => unit.id)
		);
	});

	// a run of units is one change, which is the whole of why the procedure behind it exists:
	// eighteen units named in one line are eighteen rows written together, and taking them back
	// is one press rather than eighteen.
	it('takes back a whole run of units at once, and applies it again', async () => {
		const complex = await run(useCreateComplex, { name: 'Run Court', location: 'Riyadh' });
		const created = await run(useCreateManyUnits, {
			units: Array.from({ length: 18 }, (_, step) => ({
				name: `A${step + 1}`,
				complexId: complex.id
			}))
		});

		assert.equal(created.length, 18);
		assert.equal(inverseStack.undoable?.describe(get(LL)), 'creating 18 records');

		await inverseStack.undo();
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), []);

		// one entry rather than eighteen: what the one undo uncovered is the complex itself.
		assert.equal(inverseStack.undoable?.describe(get(LL)), 'creating complex');

		await inverseStack.redo();
		assert.deepEqual(
			(await caller.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.id).sort(),
			created.map((unit) => unit.id).sort()
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
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.name, 'A1');
	});
});

/**
 * Take back a creation whose record somebody else deleted, and see it refused with `code`.
 *
 * Effort 854, requirement 8 and its criterion: the undo of a creation is a deletion, and a
 * deletion of what is already gone used to answer with nothing, which read as success and moved
 * the entry to redo, from where the record could be made again. [[rules/data]], under *Undo*.
 */
async function refusesUndoingWhatIsGone(
	code: Parameters<typeof refusedWith>[0],
	read: () => Promise<unknown>
) {
	const entry = inverseStack.undoable;
	const written = appended.length;

	assert.ok(entry, 'the creation left nothing to take back');

	await assert.rejects(() => inverseStack.undo(), refusedWith(code));
	// and through the path the key takes, which is the one that writes an account.
	await applyUndo(useQueryClient());

	assert.equal(appended.length, written, 'a refused undo writes no history');
	assert.equal(inverseStack.undoable, entry, 'the entry stays, so the reader can see what failed');
	assert.equal(inverseStack.redoable, null, 'nothing reached redo, so nothing can make it again');
	assert.equal(await read(), undefined, 'the record stays deleted');
}

describe('taking back a creation whose record somebody else deleted', () => {
	it('is refused for a unit', async () => {
		const complex = await caller.complex.create({ name: 'Gone Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'G1', complexId: complex.id });

		await caller.complex.units.delete({ id: unit.id });

		await refusesUndoingWhatIsGone('unit.gone', () => caller.complex.units.get({ id: unit.id }));
	});

	it('is refused for a contract', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await caller.contract.delete({ id: contract.id });

		await refusesUndoingWhatIsGone('contract.missing', () =>
			caller.contract.get({ id: contract.id })
		);
	});

	it('is refused for a renewal', async () => {
		const tenant = await seedTenant(caller);
		const contract = await caller.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const term = getContractRenewalTerm(contract);
		const successor = await run(useRenewContract, {
			contractId: contract.id,
			start: term.start.getTime(),
			end: term.end.getTime(),
			cost: contract.cost
		});

		await caller.contract.delete({ id: successor.id });

		await refusesUndoingWhatIsGone('contract.missing', () =>
			caller.contract.get({ id: successor.id })
		);
	});

	it('is refused for a payment', async () => {
		const tenant = await seedTenant(caller);
		const contract = await caller.contract.create({
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

		await caller.payment.delete({ id: payment.id });

		await refusesUndoingWhatIsGone('payment.missing', () => caller.payment.get({ id: payment.id }));
	});

	it('is refused for a complex', async () => {
		const complex = await run(useCreateComplex, { name: 'Gone Court', location: 'Riyadh' });

		await caller.complex.delete({ id: complex.id });

		await refusesUndoingWhatIsGone('complex.gone', () => caller.complex.get({ id: complex.id }));
	});
});

/**
 * Delete two records at once, take it back, let something come to hold `kept`, apply the deletion
 * again, and take that back.
 *
 * Effort 854, requirement 9 and its criterion: the redo is refused `kept` and removes `freed`
 * alone, so the undo after it puts back `freed` alone, rather than both and an `idTaken` on the one
 * that never left.
 */
async function undoesWhatTheRedoRemoved({
	remove,
	refuseOne,
	read,
	kept,
	freed
}: {
	remove: () => Promise<unknown>;
	refuseOne: () => Promise<unknown>;
	read: (id: string) => Promise<unknown>;
	kept: string;
	freed: string;
}) {
	await remove();
	await inverseStack.undo();
	await refuseOne();
	await inverseStack.redo();

	assert.ok(await read(kept), 'the redo was refused the record something holds');
	assert.equal(await read(freed), undefined);

	await inverseStack.undo();

	assert.ok(await read(kept));
	assert.ok(await read(freed), 'the record the redo removed is back');

	const taken = inverseStack.redoable;

	assert.deepEqual(
		[taken?.records?.('undo') ?? []].flat().map((entry) => entry.recordId),
		[freed],
		'the account names only what came back'
	);
	assert.equal(taken?.describe(get(LL)), 'deleting 1 record');
}

describe('taking back a bulk deletion after its redo was partly refused', () => {
	it('puts back only the tenants the redo removed', async () => {
		const kept = await seedTenant(caller);
		const freed = await seedTenant(caller);

		await undoesWhatTheRedoRemoved({
			remove: () => run(useDeleteManyTenants, { ids: [kept.id, freed.id], foreseen: [] }),
			refuseOne: () =>
				caller.contract.create({
					tenantId: kept.id,
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 1000
				}),
			read: (id) => caller.tenant.get({ id }),
			kept: kept.id,
			freed: freed.id
		});
	});

	it('puts back only the units the redo removed', async () => {
		const tenant = await seedTenant(caller);
		const complex = await caller.complex.create({
			name: 'Bulk Tower',
			location: 'Riyadh',
			units: [{ name: 'B1' }, { name: 'B2' }]
		});
		const [kept, freed] = complex.units;

		await undoesWhatTheRedoRemoved({
			remove: () => run(useDeleteManyUnits, { ids: [kept.id, freed.id], foreseen: [] }),
			refuseOne: () =>
				caller.contract.create({
					tenantId: tenant.id,
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 1000,
					unitIds: [kept.id]
				}),
			read: (id) => caller.complex.units.get({ id }),
			kept: kept.id,
			freed: freed.id
		});
	});

	it('puts back only the payments the redo removed', async () => {
		const contracts = await Promise.all(
			[0, 1].map(async () =>
				caller.contract.create({
					tenantId: (await seedTenant(caller)).id,
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 1000
				})
			)
		);
		const [kept, freed] = await Promise.all(
			contracts.map((contract) =>
				caller.payment.create({ contractId: contract.id, date: monthsFromNow(0), amount: 100 })
			)
		);

		await undoesWhatTheRedoRemoved({
			remove: () => run(useDeleteManyPayments, { ids: [kept.id, freed.id], foreseen: [] }),
			refuseOne: () => caller.contract.terminate({ id: kept.contractId }),
			read: (id) => caller.payment.get({ id }),
			kept: kept.id,
			freed: freed.id
		});
	});

	it('puts back only the contracts the redo removed', async () => {
		const [kept, freed] = await Promise.all(
			[0, 1].map(async () =>
				caller.contract.create({
					tenantId: (await seedTenant(caller)).id,
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 1000
				})
			)
		);

		await undoesWhatTheRedoRemoved({
			remove: () => run(useDeleteManyContracts, { ids: [kept.id, freed.id], foreseen: [] }),
			refuseOne: () =>
				caller.payment.create({ contractId: kept.id, date: monthsFromNow(0), amount: 100 }),
			read: (id) => caller.contract.get({ id }),
			kept: kept.id,
			freed: freed.id
		});
	});

	it('puts back only the complexes the redo removed, and names only those', async () => {
		const tenant = await seedTenant(caller);
		const [kept, freed] = await Promise.all(
			['Kept Court', 'Freed Court'].map((name) =>
				caller.complex.create({ name, location: 'Riyadh', units: [{ name: 'K1' }] })
			)
		);

		await undoesWhatTheRedoRemoved({
			remove: () => run(useDeleteManyComplexes, { ids: [kept.id, freed.id], foreseen: [] }),
			refuseOne: () =>
				caller.contract.create({
					tenantId: tenant.id,
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 1000,
					unitIds: [kept.units[0].id]
				}),
			read: (id) => caller.complex.get({ id }),
			kept: kept.id,
			freed: freed.id
		});
	});

	it('does nothing where the redo removed nothing', async () => {
		const tenants = [await seedTenant(caller), await seedTenant(caller)];

		await run(useDeleteManyTenants, { ids: tenants.map((tenant) => tenant.id), foreseen: [] });
		await inverseStack.undo();

		for (const tenant of tenants) {
			await caller.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 1000
			});
		}

		await inverseStack.redo();
		await inverseStack.undo();

		for (const tenant of tenants) {
			assert.deepEqual(await caller.tenant.get({ id: tenant.id }), tenant);
		}
		assert.deepEqual([inverseStack.redoable?.records?.('undo') ?? []].flat(), []);
	});
});

// effort 854, requirement 24: a complex created with no units is taken back by deleting the
// complex alone, so a member who may not delete units may still take it back.
it('asks for deleting units on taking back a complex only where it has some', async (context) => {
	context.after(() => memberPermissions.hold(null));
	memberPermissions.hold({
		permissions: maskOf(...EVERY_FLAG.filter((flag) => flag !== 'deleteUnit')),
		accessLevel: 'full-access'
	});

	await run(useCreateComplex, { name: 'Empty Court', location: 'Riyadh' });
	assert.equal(inverseStack.refusal('undo', get(LL)), undefined);

	await run(useCreateComplex, { name: 'Full Court', location: 'Riyadh', units: [{ name: 'F1' }] });
	assert.ok(inverseStack.refusal('undo', get(LL)), 'a complex with units takes them with it');
});

// effort 854, criterion 24: not only offered but carried out. The member is held without the flag
// on the client and is the caller the procedures answer, so the undo goes through the same check
// the server makes.
it('takes back a complex created with no units for a member who may not delete units', async (context) => {
	context.after(() => memberPermissions.hold(null));
	memberPermissions.hold({
		permissions: maskOf(...EVERY_FLAG.filter((flag) => flag !== 'deleteUnit')),
		accessLevel: 'full-access'
	});
	caller = await createApi({ identity: identityWithout('deleteUnit') });

	const complex = await run(useCreateComplex, { name: 'Empty Court', location: 'Riyadh' });

	assert.ok(await caller.complex.get({ id: complex.id }));

	await applyUndo(useQueryClient());

	assert.equal(await caller.complex.get({ id: complex.id }), undefined);
	assert.ok(!inverseStack.undoable, 'the entry was taken, not kept to be pressed again');
});

// effort 854, criterion 25: a refund on a terminated contract is not locked with it, so the undo
// of recording one removes it.
it('takes back a refund recorded on a terminated contract', async () => {
	const tenant = await seedTenant(caller);
	const contract = await caller.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	await caller.payment.create({ contractId: contract.id, date: monthsFromNow(0), amount: 600 });
	await caller.contract.terminate({ id: contract.id });

	const refund = await run(useCreatePayment, {
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 200,
		direction: 'refund'
	});

	assert.equal((await caller.payment.get({ id: refund.id }))?.direction, 'refund');

	await applyUndo(useQueryClient());

	assert.equal(await caller.payment.get({ id: refund.id }), undefined);
	assert.equal((await caller.contract.get({ id: contract.id }))?.status, 'terminated');
});

// ticket 40 of effort 854, the human's ruling of 2026-10-07: an undo takes a change back to the
// state before it. A restored contract may hold refunds past what a live one may return, so undoing
// the edit or the deletion of one puts back exactly what was recorded, while refunds still never
// pass what the contract received.
describe('undoing a refund change on a restored contract', () => {
	/** received 5,000, terminated, refunded 3,000, and restored: live, and owing what it returned. */
	async function seedRestoredRefund() {
		const tenant = await seedTenant(caller);
		const contract = await caller.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 100000
		});
		const received = await caller.payment.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 5000
		});

		await caller.contract.terminate({ id: contract.id });

		const refund = await caller.payment.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 3000,
			direction: 'refund'
		});

		await caller.contract.unterminate({ id: contract.id });

		return { contract, received, refund };
	}

	it('puts back the amount a lowered refund was recorded at, and lowers it again on redo', async () => {
		const { contract, refund } = await seedRestoredRefund();

		await run(useUpdatePayment, { id: refund.id, date: refund.date, amount: 2000 });
		assert.equal((await caller.payment.get({ id: refund.id }))?.amount, 2000);

		await inverseStack.undo();
		assert.equal((await caller.payment.get({ id: refund.id }))?.amount, 3000);
		assert.equal((await caller.contract.get({ id: contract.id }))?.paidAmount, 2000);

		await inverseStack.redo();
		assert.equal((await caller.payment.get({ id: refund.id }))?.amount, 2000);
	});

	it('brings a deleted refund back, one or a selection', async () => {
		const { contract, refund } = await seedRestoredRefund();

		await run(useDeletePayment, refund.id);
		await inverseStack.undo();
		assert.equal((await caller.payment.get({ id: refund.id }))?.amount, 3000);

		await run(useDeleteManyPayments, { ids: [refund.id], foreseen: [] });
		assert.equal(await caller.payment.get({ id: refund.id }), undefined);

		await inverseStack.undo();
		assert.equal((await caller.payment.get({ id: refund.id }))?.amount, 3000);
		assert.equal((await caller.contract.get({ id: contract.id }))?.paidAmount, 2000);
	});

	it('still refuses a new refund, or raising one, by hand above the limit', async () => {
		const { contract, refund } = await seedRestoredRefund();

		await assert.rejects(
			() =>
				run(useCreatePayment, {
					contractId: contract.id,
					date: monthsFromNow(0),
					amount: 1,
					direction: 'refund'
				}),
			refusedWith('contract.refundAboveLimit', { limit: 0 })
		);
		await assert.rejects(
			() => run(useUpdatePayment, { id: refund.id, date: refund.date, amount: 3001 }),
			refusedWith('contract.refundAboveLimit', { limit: 3000 })
		);
	});

	it('refuses an undo that would take refunds past what the contract received', async () => {
		const { contract, received, refund } = await seedRestoredRefund();

		await run(useDeletePayment, refund.id);
		// another device lowers what was received in the meantime.
		await caller.payment.update({ id: received.id, date: received.date, amount: 2000 });

		await assert.rejects(() => inverseStack.undo(), refusedWith('contract.refundsExceedReceived'));
		assert.equal(await caller.payment.get({ id: refund.id }), undefined);
		assert.equal((await caller.contract.get({ id: contract.id }))?.paidAmount, 2000);
		assert.ok(inverseStack.undoable, 'the inverse stays, so the user can see what failed');
	});
});
