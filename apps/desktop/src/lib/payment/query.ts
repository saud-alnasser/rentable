import api from '$lib/api/caller';
import type { FilterPeriod } from '$lib/api/period';
import { declareMutation } from '$lib/design/mutation';
import { workspacePrefixes } from '$lib/design/query';
import { LL, locale } from '$lib/i18n/i18n-svelte';
import { isRecordId } from '$lib/platform/database/identity';
import { formatLocaleNumber } from '$lib/platform/locale';
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
	search: (term: string) => [...workspacePrefixes.payments, 'search', term]
} as const;

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
