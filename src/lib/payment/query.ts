import api from '$lib/api/caller';
import { declareMutation } from '$lib/design/mutation';
import { workspacePrefixes } from '$lib/design/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	get: (id: number) => [...workspacePrefixes.payments, 'one', id],
	getMany: (contractId: number) => [...workspacePrefixes.payments, contractId],
	list: (contractId: number, search: string) => [
		...workspacePrefixes.payments,
		'list',
		contractId,
		search
	]
} as const;

/** One payment, with the contract it was made against. */
export function useFetchPayment(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.contract.payments.get({ id: freshId }),
			enabled: Number.isInteger(freshId) && freshId > 0
		};
	});
}

export function useFetchContractPayments(contractId: () => number) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getMany(id),
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
export function useListContractPayments(params: () => { contractId: number; search?: string }) {
	return createQuery(() => {
		const { contractId, search } = params();
		const trimmedSearch = search?.trim() ?? '';

		return {
			queryKey: keys.list(contractId, trimmedSearch),
			queryFn: () =>
				api.contract.payments.getMany({
					contractId,
					search: trimmedSearch || undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

export const useCreatePayment = declareMutation({
	mutate: (data: Parameters<typeof api.contract.payments.create>[0]) =>
		api.contract.payments.create(data),
	touches: ['payments', 'contracts', 'units'],
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
	toast: {
		success: () => get(LL).contracts.hooks.updatePaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeletePayment = declareMutation({
	mutate: (id: number) => api.contract.payments.delete({ id }),
	touches: ['payments', 'contracts', 'units'],
	toast: {
		success: () => get(LL).contracts.hooks.deletePaymentSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
