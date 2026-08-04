import api from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import { LL } from '$lib/i18n/i18n-svelte';
import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient,
	type InfiniteData
} from '@tanstack/svelte-query';
import { get } from 'svelte/store';

const DATA_VIEW_PAGE_SIZE = 24;
type InfinitePaymentsPage = Awaited<ReturnType<typeof api.contract.payments.getPaginated>>;

export const keys = {
	getMany: (contractId: number) => [...workspacePrefixes.payments, contractId],
	dataView: (contractId: number, search?: string) => [
		...workspacePrefixes.payments,
		'data-view',
		contractId,
		search ?? ''
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

export function useInfiniteContractPayments(params: () => { contractId: number; search?: string }) {
	return createInfiniteQuery<
		InfinitePaymentsPage,
		Error,
		InfiniteData<InfinitePaymentsPage>,
		ReturnType<typeof keys.dataView>,
		number
	>(() => {
		const { contractId, search } = params();
		const trimmedSearch = search?.trim();

		return {
			queryKey: keys.dataView(contractId, trimmedSearch),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			queryFn: ({ pageParam }) =>
				api.contract.payments.getPaginated({
					contractId,
					search: trimmedSearch || undefined,
					limit: DATA_VIEW_PAGE_SIZE,
					offset: typeof pageParam === 'number' ? pageParam : 0
				})
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
