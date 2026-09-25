import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { CreateMutationResult } from '@tanstack/svelte-query';

import { type Api, createApi, monthsFromNow, seedTenant } from '$lib/api/tests/testing.ts';
import { bindingOf } from '$lib/design/tests/testing.ts';
import { fakeSyncState } from '$lib/platform/tests/testing.ts';

/**
 * A PAYMENT KEEPS A HISTORY
 *
 * Ticket 02 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 4 and
 * its criteria 4(b) and 4(c). Recording, editing and deleting one payment each leave an entry on
 * its account, as deleting several already did, and taking an edit back leaves one too.
 *
 * **The declarations are real and so are the procedures**, over an in-memory database; the query
 * library, the toasts and the shell are substituted as `api/tests/undo.test.ts` substitutes them.
 * What is watched is `history.append`, the one procedure an account is written through, and each
 * call it receives is held so a test can wait for it: the account is written after the change and
 * never awaited into it.
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

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			remoteSync: { getState: async () => fakeSyncState() },
			diagnostics: { write: async () => {} }
		}
	}
});

const { inverseStack } = await import('$lib/design/inverse');
const { applyUndo } = await import('$lib/design/mutation');
const { useQueryClient } = await import('@tanstack/svelte-query');
const { useCreatePayment, useUpdatePayment, useDeletePayment } = await import('$lib/payment/query');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// the entry names the payment by its amount in the reader's locale, so one is loaded.
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

/** every entry appended so far, once the writes have landed, as (action, record) pairs. */
async function settled() {
	await Promise.all(writes);

	return appended.map(({ entries }) =>
		entries.map((entry) => [entry.concept, entry.recordId, entry.action, entry.record])
	);
}

async function seedContract() {
	const tenant = await seedTenant(caller);

	return caller.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 12000
	});
}

beforeEach(async () => {
	inverseStack.clear();
	caller = await createApi();
	appended.length = 0;
	writes.length = 0;
});

describe("a payment's history", () => {
	it('records a payment being recorded', async () => {
		const contract = await seedContract();
		const payment = await run(useCreatePayment, {
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		assert.deepEqual(await settled(), [[['payment', payment.id, 'created', '1,000']]]);
	});

	it('records an edit, and taking the edit back as another', async () => {
		const contract = await seedContract();
		const payment = await caller.contract.payments.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await run(useUpdatePayment, { id: payment.id, date: payment.date, amount: 1500 });
		assert.deepEqual(await settled(), [[['payment', payment.id, 'edited', '1,500']]]);

		await applyUndo(useQueryClient());

		assert.equal((await caller.contract.payments.get({ id: payment.id }))?.amount, 1000);
		// both directions are an edit, each named by the amount the payment holds after it.
		assert.deepEqual(await settled(), [
			[['payment', payment.id, 'edited', '1,500']],
			[['payment', payment.id, 'edited', '1,000']]
		]);
	});

	// ticket 03, criterion 4(a): how a payment was paid is undone as its date and amount are, and
	// the edit is on its account through the same declaration.
	it('takes back an edit to the method, the reference and the note', async () => {
		const contract = await seedContract();
		const payment = await caller.contract.payments.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000,
			method: 'cash',
			reference: 'R-1',
			note: 'first'
		});

		await run(useUpdatePayment, {
			id: payment.id,
			date: payment.date,
			amount: payment.amount,
			method: 'bank-transfer',
			reference: 'TRF-9',
			note: 'second'
		});

		const fields = async () => {
			const read = await caller.contract.payments.get({ id: payment.id });

			return [read?.method, read?.reference, read?.note];
		};

		assert.deepEqual(await fields(), ['bank-transfer', 'TRF-9', 'second']);
		assert.deepEqual(await settled(), [[['payment', payment.id, 'edited', '1,000']]]);

		await applyUndo(useQueryClient());

		assert.deepEqual(await fields(), ['cash', 'R-1', 'first']);
		assert.deepEqual(await settled(), [
			[['payment', payment.id, 'edited', '1,000']],
			[['payment', payment.id, 'edited', '1,000']]
		]);
	});

	it('takes back filling in the three on a payment that had none', async () => {
		const contract = await seedContract();
		const payment = await caller.contract.payments.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await run(useUpdatePayment, {
			id: payment.id,
			date: payment.date,
			amount: payment.amount,
			method: 'ejar',
			reference: 'SADAD-7731',
			note: 'through Ejar'
		});
		await applyUndo(useQueryClient());

		const read = await caller.contract.payments.get({ id: payment.id });

		assert.deepEqual([read?.method, read?.reference, read?.note], [null, null, null]);
	});

	// criterion 4(c): one payment deleted is one entry, and one append.
	it('records deleting one payment as exactly one entry', async () => {
		const contract = await seedContract();
		const payment = await caller.contract.payments.create({
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await run(useDeletePayment, payment.id);

		assert.deepEqual(await settled(), [[['payment', payment.id, 'deleted', '1,000']]]);
	});

	it('records taking a recording or a deletion back as the opposite', async () => {
		const contract = await seedContract();
		const payment = await run(useCreatePayment, {
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await applyUndo(useQueryClient());
		await run(useCreatePayment, { ...payment });
		await run(useDeletePayment, payment.id);
		await applyUndo(useQueryClient());

		assert.deepEqual(await settled(), [
			[['payment', payment.id, 'created', '1,000']],
			[['payment', payment.id, 'deleted', '1,000']],
			[['payment', payment.id, 'created', '1,000']],
			[['payment', payment.id, 'deleted', '1,000']],
			[['payment', payment.id, 'created', '1,000']]
		]);
	});

	it('lists what was written on the account, newest first', async () => {
		const contract = await seedContract();
		const payment = await run(useCreatePayment, {
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await settled();
		await run(useUpdatePayment, { id: payment.id, date: payment.date, amount: 1500 });
		await settled();
		await applyUndo(useQueryClient());
		await settled();

		const account = await caller.history.getMany({ concept: 'payment', recordId: payment.id });

		assert.deepEqual(
			account.map((entry) => [entry.action, entry.record]),
			[
				['edited', '1,000'],
				['edited', '1,500'],
				['created', '1,000']
			]
		);
	});
});
