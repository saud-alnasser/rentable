import api from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	list: (search?: string) => [...workspacePrefixes.contracts, 'list', search ?? ''],
	get: (id: number) => [...workspacePrefixes.contracts, id],
	getUnits: (id: number) => [...workspacePrefixes.contracts, 'units', id],
	getVacantUnits: (contractId: number, complexId: number) => [
		...workspacePrefixes.contracts,
		'units',
		'vacant',
		contractId,
		complexId
	]
} as const;

/**
 * The contracts list for a search: the whole result set, in the queue's attention order.
 *
 * `placeholderData` holds the previous set while a new search is in flight, so the list
 * keeps rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useListContracts(search: () => string = () => '') {
	return createQuery(() => {
		const trimmedSearch = search().trim();

		return {
			queryKey: keys.list(trimmedSearch),
			queryFn: () => api.contract.getMany({ search: trimmedSearch || undefined }),
			placeholderData: <T>(previous: T) => previous
		};
	});
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
			await invalidateWorkspaceData(client);

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
			await invalidateWorkspaceData(client);

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
				await invalidateWorkspaceData(client);
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
			await invalidateWorkspaceData(client);

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
			await invalidateWorkspaceData(client);

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
			await invalidateWorkspaceData(client);

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
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
