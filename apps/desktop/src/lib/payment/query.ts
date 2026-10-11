import api from '$lib/api/caller';
import { readRecord } from '$lib/error/read';
import type { FilterPeriod } from '$lib/date';
import { prefixOf } from '$lib/mutation';
import { declareMutation, describeOutcomeChange } from '$lib/mutation/ui';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history';
import { LL, locale } from '$lib/i18n/i18n-svelte';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { isPaymentSortColumnId } from '$lib/payment/payment';
import { isRecordId } from '$lib/platform/database/identity';
import type { PaymentDirection } from '$lib/platform/database/schema';
import type { ListSort } from '@rentable/design/sort.js';
import { formatLocaleMoney, formatLocaleNumber } from '$lib/platform/locale';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	get: (id: string) => [...prefixOf('payment'), 'one', id],
	receipt: (id: string) => [...prefixOf('payment'), 'receipt', id],
	getMany: (contractId: string) => [...prefixOf('payment'), contractId],
	// the period is part of the key because it is part of the question: two periods are two
	// result sets, and sharing a key would serve one of them under the other's name.
	list: (
		contractId: string,
		search: string,
		period: FilterPeriod | undefined,
		sort: ListSort | null = null
	) => [
		...prefixOf('payment'),
		'list',
		contractId,
		search,
		period ?? null,
		sort ? `${sort.columnId}:${sort.direction}` : 'default'
	],
	search: (term: string) => [...prefixOf('payment'), 'search', term],
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (ids: readonly string[]) => [...prefixOf('payment'), 'plan', [...ids].sort().join(',')]
} as const;

/** Why a payment in a selection would be turned away, read off the procedure rather than restated. */
export type PaymentRefusalReason = Awaited<
	ReturnType<typeof api.payment.planMany>
>['refused'][number]['reason'];

const toPaymentIds = (payments: readonly { id: string }[]) => payments.map((payment) => payment.id);

/** A payment as anything here names one: its amount, and which way the money went. */
type NamedPayment = { amount: number; direction?: PaymentDirection };

/**
 * What a payment is called where a name is wanted: its amount in the reader's locale, and a refund
 * says it is one (effort 854, requirement 25), so an account or a search never reads money
 * returned as money received.
 */
export function toPaymentName(payment: NamedPayment) {
	const amount = formatLocaleNumber(get(locale), payment.amount);

	return payment.direction === 'refund'
		? get(LL).contracts.payments.refund.historyName({ amount })
		: amount;
}

/** The noun an undo names a payment by: a payment, or a refund. */
const toPaymentNoun = (payment: NamedPayment, t: TranslationFunctions) =>
	payment.direction === 'refund' ? t.contracts.payments.refund.title() : t.common.labels.payment();

/**
 * One line on one payment's own account.
 *
 * A payment has no name, so what names it is the amount, rendered in the reader's locale and
 * frozen there: an account has to still read once the record it is about is gone, which is the
 * same reason every other entry freezes its name. A refund's name says it is one. The concept and
 * the actions stay a payment's, which an older build reads.
 */
const toPaymentHistoryEntry = (
	payment: { id: string } & NamedPayment,
	action: HistoryEntry['action']
) => ({
	concept: 'payment' as const,
	recordId: payment.id,
	action,
	record: toPaymentName(payment)
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
				const matches = await api.payment.search({ term: trimmed, limit });

				return matches.map(({ direction, ...match }) => ({
					...match,
					label: toPaymentName({ amount: Number(match.label), direction })
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
			// a payment that is not there answers `null`, so it is not found rather than failed.
			queryFn: () => readRecord(api.payment.get({ id: freshId })),
			enabled: isRecordId(freshId)
		};
	});
}

/**
 * Read one payment once, with the contract it was made against, for a caller that holds only its
 * identity or a ledger row short of that contract: the payment host, answering an act the command
 * menu named by id, and copying a payment's details. Under the key `useFetchPayment` reads.
 */
export function useReadPayment() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({
			queryKey: keys.get(id),
			queryFn: () => readRecord(api.payment.get({ id }))
		});
}

/**
 * Read what a payment's receipt states, once, for the payment host printing it. Under the payments
 * prefix, so any payment written anywhere leaves it stale and the next receipt is read afresh: what
 * one payment covers depends on every payment of its contract.
 */
export function useReadPaymentReceipt() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({
			queryKey: keys.receipt(id),
			queryFn: () => api.payment.receipt({ id })
		});
}

/**
 * What `payment.receipt` answers: a receipt for a payment received, or a voucher for a refund
 * (effort 854, requirement 29), told apart by `kind`.
 */
export type PaymentPrintout = Awaited<ReturnType<typeof api.payment.receipt>>;

/** What a payment's receipt states, as `payment.receipt` answers for a payment received. */
export type PaymentReceipt = Exclude<PaymentPrintout, { kind: 'voucher' }>;

/** What a refund's voucher states, as `payment.receipt` answers for a refund. */
export type PaymentVoucher = Extract<PaymentPrintout, { kind: 'voucher' }>;

export function useFetchContractPayments(
	contractId: () => string,
	enabled: () => boolean = () => true
) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getMany(id),
			enabled: enabled(),
			queryFn: () => api.payment.getMany({ contractId: id })
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
	params: () => {
		contractId: string;
		search?: string;
		period?: FilterPeriod;
		sort?: ListSort | null;
	}
) {
	return createQuery(() => {
		const { contractId, search, period, sort = null } = params();
		const trimmedSearch = search?.trim() ?? '';

		return {
			queryKey: keys.list(contractId, trimmedSearch, period, sort),
			queryFn: () =>
				api.payment.getMany({
					contractId,
					search: trimmedSearch || undefined,
					period,
					sort:
						sort && isPaymentSortColumnId(sort.columnId)
							? { columnId: sort.columnId, direction: sort.direction }
							: undefined
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
			queryFn: () => api.payment.planMany({ ids: named })
		};
	});
}

export const useCreatePayment = declareMutation({
	mutate: (data: Parameters<typeof api.payment.create>[0]) => api.payment.create(data),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: toPaymentNoun(result, t) }),
		flags: { undo: ['deletePayment'], redo: ['createPayment'] },
		undo: () => api.payment.delete({ id: result.id }),
		// a redo replays the recording, so a refund is weighed as an undo's is (ticket 40).
		redo: () => api.payment.create({ ...result, replay: true }),
		records: (direction) =>
			toPaymentHistoryEntry(result, direction === 'undo' ? 'deleted' : 'created')
	}),
	records: ({ result }) => toPaymentHistoryEntry(result, 'created'),
	toast: {
		success: ({ result }) =>
			result.direction === 'refund'
				? get(LL).contracts.payments.refund.created()
				: get(LL).contracts.hooks.createPaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdatePayment = declareMutation({
	mutate: (data: Parameters<typeof api.payment.update>[0]) => api.payment.update(data),
	touches: ['payments', 'contracts', 'units'],
	capture: (variables) => api.payment.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: toPaymentNoun(captured, t) }),
			flags: { undo: ['editPayment'], redo: ['editPayment'] },
			// both replay a change rather than make one, so a refund goes back to what was recorded
			// even past the limit a restored contract now sets (ticket 40 of effort 854).
			undo: () => api.payment.update({ ...captured, replay: true }),
			redo: () => api.payment.update({ ...variables, replay: true }),
			// both directions are an edit, as a contract's are. The amount named is the one the
			// payment holds once that direction has run, since the amount is what names a payment
			// and an edit is often a change to exactly that.
			// an edit never changes which way the money went, so the stored direction names both.
			records: (direction) =>
				toPaymentHistoryEntry(
					direction === 'undo' ? captured : { ...variables, direction: captured.direction },
					'edited'
				)
		},
	records: ({ result }) => toPaymentHistoryEntry(result, 'edited'),
	toast: {
		success: ({ result }) =>
			result.direction === 'refund'
				? get(LL).contracts.payments.refund.updated()
				: get(LL).contracts.hooks.updatePaymentSuccess(),
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
	mutate: ({ ids }: SelectionCall) => api.payment.deleteMany({ ids }),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is a
		// control that appears to have done something.
		result.deleted.length === 0
			? undefined
			: (() => {
					// what the last deletion took, which the next undo puts back: a redo is refused whatever
					// has come to hold one since and removes the rest, so the undo after it puts back only
					// those, and nothing where it removed nothing.
					let removed = result.deleted;

					return {
						describe: (t) => t.common.undo.deletedMany({ count: removed.length }),
						flags: { undo: ['createPayment'], redo: ['deletePayment'] },
						undo: async () => {
							if (removed.length > 0) {
								await api.payment.createMany({ payments: removed });
							}
						},
						redo: async () => {
							removed = (await api.payment.deleteMany({ ids: toPaymentIds(result.deleted) }))
								.deleted;
						},
						records: (direction) =>
							removed.map((payment) =>
								toPaymentHistoryEntry(payment, direction === 'undo' ? 'created' : 'deleted')
							)
					};
				})(),
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
	mutate: (id: string) => api.payment.delete({ id }),
	touches: ['payments', 'contracts', 'units'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: toPaymentNoun(result, t) }),
			flags: { undo: ['createPayment'], redo: ['deletePayment'] },
			undo: () => api.payment.create({ ...result, replay: true }),
			redo: () => api.payment.delete({ id: result.id }),
			records: (direction) =>
				toPaymentHistoryEntry(result, direction === 'undo' ? 'created' : 'deleted')
		},
	// the amount is frozen here for the reason the whole entry is: a moment later the record is
	// gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) => result && toPaymentHistoryEntry(result, 'deleted'),
	toast: {
		success: ({ result }) =>
			result?.direction === 'refund'
				? get(LL).contracts.payments.refund.deleted()
				: get(LL).contracts.hooks.deletePaymentSuccess(),
		// no dialog asked first, so the announcement says how long it can be taken back.
		detail: () => get(LL).common.undo.lasts(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
