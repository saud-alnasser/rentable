import api from '$lib/api/caller';
import type { FilterPeriod } from '$lib/api/period';
import { declareMutation, describeOutcomeChange } from '$lib/design/mutation';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history/history';
import { workspacePrefixes } from '$lib/design/query';
import { LL, locale } from '$lib/i18n/i18n-svelte';
import { isRecordId } from '$lib/platform/database/identity';
import { formatLocaleMoney, formatLocaleNumber } from '$lib/platform/locale';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	get: (id: string) => [...workspacePrefixes.payments, 'one', id],
	getMany: (contractId: string) => [...workspacePrefixes.payments, contractId],
	// the period is part of the key because it is part of the question: two periods are two
	// result sets, and sharing a key would serve one of them under the other's name.
	list: (contractId: string, search: string, period: FilterPeriod | undefined) => [
		...workspacePrefixes.payments,
		'list',
		contractId,
		search,
		period ?? null
	],
	search: (term: string) => [...workspacePrefixes.payments, 'search', term],
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (ids: readonly string[]) => [
		...workspacePrefixes.payments,
		'plan',
		[...ids].sort().join(',')
	]
} as const;

/** Why a payment in a selection would be turned away, read off the procedure rather than restated. */
export type PaymentRefusalReason = Awaited<
	ReturnType<typeof api.contract.payments.planMany>
>['refused'][number]['reason'];

const toPaymentIds = (payments: readonly { id: string }[]) => payments.map((payment) => payment.id);

/**
 * One line on one payment's own account.
 *
 * A payment has no name, so what names it is the amount, rendered in the reader's locale and
 * frozen there: an account has to still read once the record it is about is gone, which is the
 * same reason every other entry freezes its name.
 */
const toPaymentHistoryEntry = (
	payment: { id: string; amount: number },
	action: HistoryEntry['action']
) => ({
	concept: 'payment' as const,
	recordId: payment.id,
	action,
	record: formatLocaleNumber(get(locale), payment.amount)
});

/**
 * The payments a palette search reaches, across every contract.
 *
 * The amount arrives as it is stored and is rendered here, in the reader's locale — a figure
 * shown one way in a ledger and another in the palette is two answers to the same question.
 */
export function useSearchPayments(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: async () => {
				const matches = await api.contract.payments.search({ term: trimmed, limit });

				return matches.map((match) => ({
					...match,
					label: formatLocaleNumber(get(locale), Number(match.label))
				}));
			},
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/** One payment, with the contract it was made against. */
export function useFetchPayment(id: () => string) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.contract.payments.get({ id: freshId }),
			enabled: isRecordId(freshId)
		};
	});
}

export function useFetchContractPayments(
	contractId: () => string,
	enabled: () => boolean = () => true
) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getMany(id),
			enabled: enabled(),
			queryFn: () => api.contract.payments.getMany({ contractId: id })
		};
	});
}

/**
 * A contract's ledger for a search: every payment it holds, newest first.
 *
 * `placeholderData` holds the previous set while a new query is in flight, so the ledger
 * keeps rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useListContractPayments(
	params: () => { contractId: string; search?: string; period?: FilterPeriod }
) {
	return createQuery(() => {
		const { contractId, search, period } = params();
		const trimmedSearch = search?.trim() ?? '';

		return {
			queryKey: keys.list(contractId, trimmedSearch, period),
			queryFn: () =>
				api.contract.payments.getMany({
					contractId,
					search: trimmedSearch || undefined,
					period
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/**
 * What deleting the payments named would do, before it is done.
 *
 * Asked of the workspace rather than read off the rows, like every other list. A ledger row
 * carries the date and the amount, and what locks a payment is its contract's status, so the row
 * could not answer even if the application were willing to let it.
 */
export function usePlanManyPayments(ids: () => readonly string[]) {
	return createQuery(() => {
		const named = [...ids()];

		return {
			queryKey: keys.plan(named),
			enabled: named.length > 0,
			queryFn: () => api.contract.payments.planMany({ ids: named })
		};
	});
}

export const useCreatePayment = declareMutation({
	mutate: (data: Parameters<typeof api.contract.payments.create>[0]) =>
		api.contract.payments.create(data),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.payment() }),
		undo: () => api.contract.payments.delete({ id: result.id }),
		redo: () => api.contract.payments.create(result)
	}),
	toast: {
		success: () => get(LL).contracts.hooks.createPaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdatePayment = declareMutation({
	mutate: (data: Parameters<typeof api.contract.payments.update>[0]) =>
		api.contract.payments.update(data),
	touches: ['payments', 'contracts', 'units'],
	capture: (variables) => api.contract.payments.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.payment() }),
			undo: () => api.contract.payments.update(captured),
			redo: () => api.contract.payments.update(variables)
		},
	toast: {
		success: () => get(LL).contracts.hooks.updatePaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Delete every payment in the selection whose contract is not locked, as one change.
 *
 * **Taking it back is all or nothing.** The inverse creates the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest, which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, because putting a record back means
 * putting it back as itself, by the identity it had (ADR 0026).
 */
export const useDeleteManyPayments = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.contract.payments.deleteMany({ ids }),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is a
		// control that appears to have done something.
		result.deleted.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.deletedMany({ count: result.deleted.length }),
					undo: () => api.contract.payments.createMany({ payments: result.deleted }),
					redo: () => api.contract.payments.deleteMany({ ids: toPaymentIds(result.deleted) }),
					records: (direction) =>
						result.deleted.map((payment) =>
							toPaymentHistoryEntry(payment, direction === 'undo' ? 'created' : 'deleted')
						)
				},
	// the amounts are frozen here for the reason the whole entry is: a moment later the records
	// are gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) =>
		result.deleted.map((payment) => toPaymentHistoryEntry(payment, 'deleted')),
	// what it turned away that the confirmation did not show, which is the workspace having
	// moved while the reader was deciding. A payment has no name, so the amount stands in, and it
	// is rendered the way the ledger and its confirmation render one: a figure written as money in
	// the dialog and as a bare number in the notice a second later is two answers to one question.
	// One that is no longer there has no amount left to give, and is counted rather than named.
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) =>
			refusal.reason === 'missing' ? '' : formatLocaleMoney(get(locale), refusal.amount)
		),
	toast: {
		// the count, because it is the one thing about a bulk action a reader cannot see for
		// themselves, and nothing at all where the selection turned out to hold nothing this could
		// be done to. The confirmation has already said why in that case.
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).contracts.hooks.deleteManyPaymentsSuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeletePayment = declareMutation({
	mutate: (id: string) => api.contract.payments.delete({ id }),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.payment() }),
			undo: () => api.contract.payments.create(result),
			redo: () => api.contract.payments.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).contracts.hooks.deletePaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
