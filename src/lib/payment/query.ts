import api from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	getMany: (contractId: number) => [...workspacePrefixes.payments, contractId],
	list: (contractId: number, search: string) => [
		...workspacePrefixes.payments,
		'list',
		contractId,
		search
	]
} as const;

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

export function useCreatePayment(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.createPaymentSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.payments.create>[0]) =>
			api.contract.payments.create(data),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdatePayment(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.updatePaymentSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.payments.update>[0]) =>
			api.contract.payments.update(data),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeletePayment(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.deletePaymentSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.contract.payments.delete({ id }),
		onSuccess: async (deleted) => {
			if (deleted) {
				await invalidateWorkspaceData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
