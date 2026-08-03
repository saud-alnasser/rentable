import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { keys as contractKeys } from '$lib/contract/query';
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
	getMany: (contractId: number) => ['contracts', 'payments', contractId],
	dataView: (contractId: number, search?: string) => [
		'contracts',
		'payments',
		'data-view',
		contractId,
		search ?? ''
	]
} as const;

// every payment changes what its contract is owed, so a payment mutation invalidates the
// contract tree rather than only its own keys — which sit under it.
async function invalidateContractData(client: ReturnType<typeof useQueryClient>) {
	await client.invalidateQueries({ queryKey: contractKeys.all });
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
			await invalidateContractData(client);

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
			await invalidateContractData(client);

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
				await invalidateContractData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
