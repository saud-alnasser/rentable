import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { CreateMutationResult } from '@tanstack/svelte-query';

import { type Api, createApi } from '$lib/app/tests/testing.ts';
import { getContractRenewalTerm } from '$lib/contract/renewal/renewal.ts';
import { seedComplexWithUnit, seedContract } from '$lib/contract/tests/seed.ts';
import { bindingOf } from '#tests/mutation.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';

/**
 * RENEWING A CONTRACT AND CHANGING ITS UNITS KEEP A HISTORY
 *
 * Ticket 05 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], requirement 23 and its
 * criterion 23. Renewing writes `renewed` on the contract renewed and on the one it produced, and
 * taking it back writes `deleted` on the second; setting a contract's units writes `assigned`, and
 * so does taking that back.
 *
 * **The declarations are real and so are the procedures**, over an in-memory database, as in
 * `payment/tests/history.test.ts`: what is watched is `history.append`, and each call it receives
 * is held so a test can wait for it, since the account is never awaited into the change.
 */

let caller: Api = await createApi();

/** every call `history.append` received, in order, and the write each one started. */
const appended: { entries: Parameters<Api['history']['append']>[0]['entries'] }[] = [];
const writes: Promise<unknown>[] = [];

mock.module('$lib/api/caller', {
	exports: {
		default: new Proxy(
			{},
			{
				get: (_target, concept) =>
					concept === 'history'
						? {
								...caller.history,
								append: (input: Parameters<Api['history']['append']>[0]) => {
									appended.push(input);

									const write = caller.history.append(input);

									writes.push(write);

									return write;
								}
							}
						: Reflect.get(caller, concept)
			}
		)
	}
});

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({ invalidateQueries: async () => {} }),
		createMutation: (options: () => unknown) => options(),
		createQuery: () => ({})
	}
});

mock.module('svelte-sonner', {
	exports: { toast: { success: () => {}, error: () => {}, dismiss: () => {} } }
});

mock.module('$lib/sync/tauri', {
	exports: { tauri: { getState: async () => fakeSyncState() } }
});

mock.module('$lib/platform/tauri', {
	exports: { tauri: { diagnostics: { write: async () => {} } } }
});

const { inverseStack } = await import('$lib/undo/undo');
const { applyUndo, applyRedo } = await import('$lib/undo');
const { useQueryClient } = await import('@tanstack/svelte-query');
const { useSetContractUnits } = await import('$lib/contract/query');
const { useRenewContract } = await import('$lib/contract/renewal/query');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

await import('$lib/app/cache');

loadLocale('en');
setLocale('en');

/** Drive one declared mutation the way the query client does: capture, call, then settle. */
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

/** every entry appended so far, once the writes have landed. */
async function settled() {
	await Promise.all(writes);

	return appended.map(({ entries }) =>
		entries.map((entry) => [entry.concept, entry.recordId, entry.action, entry.record])
	);
}

beforeEach(async () => {
	inverseStack.clear();
	caller = await createApi();
	appended.length = 0;
	writes.length = 0;
});

describe("a contract's history", () => {
	it('records a renewal on both contracts, and taking it back as a deletion', async () => {
		const contract = await seedContract(caller, { govId: 'CT-001' });
		const term = getContractRenewalTerm(contract);
		const successor = await run(useRenewContract, {
			contractId: contract.id,
			govId: 'CT-002',
			start: term.start.getTime(),
			end: term.end.getTime(),
			cost: contract.cost
		});

		assert.deepEqual(await settled(), [
			[
				['contract', contract.id, 'renewed', 'CT-001'],
				['contract', successor.id, 'renewed', 'CT-002']
			]
		]);

		await applyUndo(useQueryClient());

		assert.equal(await caller.contract.get({ id: successor.id }), undefined);
		assert.deepEqual((await settled()).at(-1), [['contract', successor.id, 'deleted', 'CT-002']]);

		await applyRedo(useQueryClient());

		assert.deepEqual((await settled()).at(-1), [
			['contract', contract.id, 'renewed', 'CT-001'],
			['contract', successor.id, 'renewed', 'CT-002']
		]);
	});

	it('records changing its units as an assignment, and taking it back as another', async () => {
		const contract = await seedContract(caller, { govId: 'CT-001' });
		const { unit } = await seedComplexWithUnit(caller, 'A');

		await run(useSetContractUnits, { contractId: contract.id, unitIds: [unit.id] });

		assert.deepEqual(await settled(), [[['contract', contract.id, 'assigned', 'CT-001']]]);

		await applyUndo(useQueryClient());

		assert.deepEqual(await caller.contract.units.getMany({ contractId: contract.id }), []);
		assert.deepEqual(await settled(), [
			[['contract', contract.id, 'assigned', 'CT-001']],
			[['contract', contract.id, 'assigned', 'CT-001']]
		]);
	});

	it('lists the renewal and the assignment on the account', async () => {
		const contract = await seedContract(caller, { govId: 'CT-001' });
		const { unit } = await seedComplexWithUnit(caller, 'A');
		const term = getContractRenewalTerm(contract);

		await run(useSetContractUnits, { contractId: contract.id, unitIds: [unit.id] });
		await settled();
		await run(useRenewContract, {
			contractId: contract.id,
			start: term.start.getTime(),
			end: term.end.getTime(),
			cost: contract.cost
		});
		await settled();

		const account = await caller.history.getMany({ concept: 'contract', recordId: contract.id });

		assert.deepEqual(
			account.map((entry) => entry.action),
			['renewed', 'assigned']
		);
	});
});
