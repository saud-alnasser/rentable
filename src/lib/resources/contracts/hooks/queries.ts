import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
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
type InfiniteContractsPage = Awaited<ReturnType<typeof api.contract.getPaginated>>;
type InfinitePaymentsPage = Awaited<ReturnType<typeof api.contract.payments.getPaginated>>;

export const keys = {
	all: ['contracts'],
	dashboard: ['contracts', 'dashboard'],
	dataView: (search?: string) => ['contracts', 'data-view', search ?? ''],
	get: (id: number) => ['contracts', id],
	getUnits: (id: number) => ['contracts', 'units', id],
	getVacantUnits: (contractId: number, complexId: number) => [
		'contracts',
		'units',
		'vacant',
		contractId,
		complexId
	],
	getPayments: (id: number) => ['contracts', 'payments', id],
	getPaymentsDataView: (id: number, search?: string) => [
		'contracts',
		'payments',
		'data-view',
		id,
		search ?? ''
	]
} as const;

async function invalidateContractData(client: ReturnType<typeof useQueryClient>) {
	await client.invalidateQueries({ queryKey: keys.all });
}

async function invalidateContractAndComplexUnitData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		invalidateContractData(client),
		client.invalidateQueries({ queryKey: ['complexes', 'units'] })
	]);
}

export function useFetchContracts() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.contract.getMany({})
	}));
}

export function useInfiniteContracts(search: () => string = () => '') {
	return createInfiniteQuery<
		InfiniteContractsPage,
		Error,
		InfiniteData<InfiniteContractsPage>,
		ReturnType<typeof keys.dataView>,
		number
	>(() => {
		const trimmedSearch = search().trim();

		return {
			queryKey: keys.dataView(trimmedSearch),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			queryFn: ({ pageParam }) =>
				api.contract.getPaginated({
					search: trimmedSearch || undefined,
					limit: DATA_VIEW_PAGE_SIZE,
					offset: typeof pageParam === 'number' ? pageParam : 0
				})
		};
	});
}

export function useFetchContractDashboard() {
	return createQuery(() => ({
		queryKey: keys.dashboard,
		queryFn: () => api.contract.dashboard()
	}));
}

export function useFetchContract(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.contract.get({ id: freshId })
		};
	});
}

export function useCreateContract(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.createSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.create>[0]) => api.contract.create(data),
		onSuccess: async () => {
			await invalidateContractData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateContract(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.updateSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.update>[0]) => api.contract.update(data),
		onSuccess: async () => {
			await invalidateContractData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteContract(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.deleteSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.contract.delete({ id }),
		onSuccess: async (deleted) => {
			if (deleted) {
				await invalidateContractData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useTerminateContract(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.terminateSuccess(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.contract.terminate({ id }),
		onSuccess: async () => {
			await invalidateContractData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUnterminateContract(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.restoreSuccess(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.contract.unterminate({ id }),
		onSuccess: async () => {
			await invalidateContractData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useFetchContractUnits(contractId: () => number) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getUnits(id),
			queryFn: () => api.contract.units.getMany({ contractId: id })
		};
	});
}

export function useFetchVacantContractUnits(
	params: () => { contractId: number; complexId: number | undefined }
) {
	return createQuery(() => {
		const { contractId, complexId } = params();

		return {
			queryKey: keys.getVacantUnits(contractId, complexId ?? 0),
			enabled: Boolean(complexId),
			queryFn: async () => {
				if (!complexId) return [];

				return api.contract.units.getVacantMany({ contractId, complexId });
			}
		};
	});
}

export function useAssignContractUnits(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.assignUnitsSuccess(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.units.assign>[0]) =>
			api.contract.units.assign(data),
		onSuccess: async () => {
			await invalidateContractAndComplexUnitData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useRemoveContractUnit(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).contracts.hooks.removeUnitSuccess(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.contract.units.remove>[0]) =>
			api.contract.units.remove(data),
		onSuccess: async () => {
			await invalidateContractAndComplexUnitData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useFetchContractPayments(contractId: () => number) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getPayments(id),
			queryFn: () => api.contract.payments.getMany({ contractId: id })
		};
	});
}

export function useInfiniteContractPayments(params: () => { contractId: number; search?: string }) {
	return createInfiniteQuery<
		InfinitePaymentsPage,
		Error,
		InfiniteData<InfinitePaymentsPage>,
		ReturnType<typeof keys.getPaymentsDataView>,
		number
	>(() => {
		const { contractId, search } = params();
		const trimmedSearch = search?.trim();

		return {
			queryKey: keys.getPaymentsDataView(contractId, trimmedSearch),
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
