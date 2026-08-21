import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { CreateMutationResult } from '@tanstack/svelte-query';

import type { SelectionCall } from '$lib/design/selection.ts';
import { bindingOf } from '$lib/design/tests/testing.ts';

/**
 * Every list that plans an action declares what to say when the workspace moved under the open
 * confirmation, and this is the one place that checks all of them at once.
 *
 * **It covers the declarations rather than the mechanism.** `design/tests/mutation.test.ts` drives
 * the mechanism, so what is left to get wrong is a list that quietly declares nothing, which is
 * exactly the state four of the five lists were in before. A file per concept would repeat this
 * harness four times to assert one line each.
 *
 * The query library and the toast reach a `.svelte` file, which this harness cannot load, so both
 * are substituted. The substitutes are also the assertions.
 */

/** one announcement the substituted toast was asked to render. */
type Announcement = { level: 'success' | 'error' | 'warning'; message: string };

const raised: Announcement[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (message: string) => raised.push({ level: 'success', message }),
			error: (message: string) => raised.push({ level: 'error', message }),
			warning: (message: string) => raised.push({ level: 'warning', message }),
			dismiss: () => undefined
		}
	}
});

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({ invalidateQueries: async () => undefined }),
		createMutation: (options: () => unknown) => options(),
		createQuery: (options: () => unknown) => options()
	}
});

const contract = await import('$lib/contract/query');
const tenant = await import('$lib/tenant/query');
const complex = await import('$lib/complex/query');
const payment = await import('$lib/payment/query');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// the notice names itself in the reader's language, so it is only assertable once a locale is
// loaded: the same two calls the application makes at startup.
loadLocale('en');
setLocale('en');

/** an id nothing in the selection was shown as refused, so the outcome differs from the plan. */
const UNFORESEEN = 'turned-away';

/**
 * Drive one declaration's success path with a result it did not foresee, and answer with what
 * was raised.
 *
 * The procedure is never called. What is under test is the declaration reading a result, and a
 * result built here is the shape the router actually answers with rather than a partial of one.
 */
async function noticeFor<TResult>(
	// the hook the concept exports, whose binding carries the declaration behind it. Typed by the
	// result the declaration made concrete, so a fixture below that stopped matching what its
	// router answers with is a build failure rather than a test that still passes.
	hook: () => CreateMutationResult<TResult, Error, SelectionCall, void>,
	result: TResult,
	foreseen: readonly string[] = []
) {
	raised.length = 0;

	const mutation = bindingOf<SelectionCall, TResult, void>(hook);
	const variables = { ids: [UNFORESEEN], foreseen };

	await mutation.onSuccess(result, variables, undefined);

	return raised.filter((announcement) => announcement.level === 'warning');
}

/**
 * Every action a list declares, each paired with the result its own procedure answers with.
 *
 * The pair is closed over rather than held as two fields, because the seven results are seven
 * different shapes: an array of both would widen to a union and let any hook be driven with any
 * other's result, which is the correlation this file exists to keep. Closing over them keeps each
 * one concrete, so a fixture that stopped matching its router is a build failure here.
 */
const DECLARATIONS = [
	{
		list: 'the contracts directory, terminating',
		named: '4021',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				contract.useTerminateManyContracts,
				{
					terminated: [],
					refused: [{ id: UNFORESEEN, govId: '4021', reason: 'not-terminable' as const }]
				},
				foreseen
			)
	},
	{
		list: 'the contracts directory, restoring',
		named: '4022',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				contract.useRestoreManyContracts,
				{
					unterminated: [],
					refused: [{ id: UNFORESEEN, govId: '4022', reason: 'not-restorable' as const }]
				},
				foreseen
			)
	},
	{
		list: 'the contracts directory, deleting',
		named: '4023',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				contract.useDeleteManyContracts,
				{
					deleted: [],
					refused: [{ id: UNFORESEEN, govId: '4023', reason: 'holds-payments' as const }]
				},
				foreseen
			)
	},
	{
		list: 'the tenants directory',
		named: 'Basim',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				tenant.useDeleteManyTenants,
				{
					deleted: [],
					refused: [{ id: UNFORESEEN, name: 'Basim', reason: 'holds-contracts' as const }]
				},
				foreseen
			)
	},
	{
		list: 'the complexes directory',
		named: 'Abraj',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				complex.useDeleteManyComplexes,
				{
					deleted: [],
					refused: [{ id: UNFORESEEN, name: 'Abraj', reason: 'holds-units' as const }]
				},
				foreseen
			)
	},
	{
		list: "a complex's units directory",
		named: 'A12',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				complex.useDeleteManyUnits,
				{
					deleted: [],
					refused: [{ id: UNFORESEEN, name: 'A12', reason: 'holds-contracts' as const }]
				},
				foreseen
			)
	},
	{
		list: "a contract's payment ledger",
		// a payment has no name, so the amount stands in, rendered as money the way the ledger's
		// own confirmation renders it rather than as a bare figure.
		named: '1,500',
		notice: (foreseen?: readonly string[]) =>
			noticeFor(
				payment.useDeleteManyPayments,
				{
					deleted: [],
					refused: [{ id: UNFORESEEN, amount: 1500, reason: 'contract-terminated' as const }]
				},
				foreseen
			)
	}
];

describe('every list that plans says when the workspace moved under it', () => {
	for (const { list, named, notice } of DECLARATIONS) {
		it(`${list} names what it turned away that the confirmation did not show`, async () => {
			const warnings = await notice();

			assert.equal(warnings.length, 1, 'the list declared no notice');
			assert.match(warnings[0].message, new RegExp(named));
		});

		it(`${list} says nothing where the outcome matched the plan`, async () => {
			assert.deepEqual(await notice([UNFORESEEN]), []);
		});
	}
});

describe('and says it in a form a reader can act on', () => {
	/** what a record removed by another device mid-decision comes back as: refused, and nameless. */
	function goneUnderneath(count: number) {
		return {
			deleted: [],
			refused: Array.from({ length: count }, (_unused, index) => ({
				id: `gone-${index}`,
				name: '',
				reason: 'missing' as const
			}))
		};
	}

	it('counts the records it cannot name rather than repeating a generic word', async () => {
		// the reason this notice usually fires. Forty of them named by their concept's label would
		// be the word `tenant` forty times, which says less than the number does.
		const warnings = await noticeFor(tenant.useDeleteManyTenants, goneUnderneath(40));

		assert.equal(warnings.length, 1);
		assert.match(warnings[0].message, /40/);
		assert.doesNotMatch(warnings[0].message, /tenant/);
	});

	it('and a payment it cannot name is counted rather than given an amount of nothing', async () => {
		// a payment that is no longer there has no amount left to give, and zero is a real amount.
		const warnings = await noticeFor(payment.useDeleteManyPayments, {
			deleted: [],
			refused: [{ id: 'gone', amount: 0, reason: 'missing' as const }]
		});

		assert.equal(warnings.length, 1);
		assert.doesNotMatch(warnings[0].message, /0/);
	});

	it('names a handful and counts the rest, including the ones it could not name', async () => {
		const named = Array.from({ length: 6 }, (_unused, index) => ({
			id: `named-${index}`,
			name: `Tower ${index}`,
			reason: 'holds-units' as const
		}));
		const warnings = await noticeFor(complex.useDeleteManyComplexes, {
			deleted: [],
			refused: [...named, { id: 'gone', name: '', reason: 'missing' as const }]
		});

		assert.equal(warnings.length, 1);
		// four named, and the count covers the two it stopped at plus the one it could not name.
		assert.match(warnings[0].message, /Tower 0, Tower 1, Tower 2, Tower 3/);
		assert.doesNotMatch(warnings[0].message, /Tower 4/);
		assert.match(warnings[0].message, /3 more/);
	});
});
