import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: ['contracts'],
	dashboard: ['contracts', 'dashboard'],
	get: (id: number) => ['contracts', id],
	getUnits: (id: number) => ['contracts', 'units', id],
	getVacantUnits: (contractId: number, complexId: number) => [
		'contracts',
		'units',
		'vacant',
		contractId,
		complexId
	],
	getPayments: (id: number) => ['contracts', 'payments', id]
} as const;

export function useFetchContracts() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.contract.getMany({})
	}));
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
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.dashboard });

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
		onSuccess: (updated) => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.get(updated.id) });

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
		onSuccess: (deleted) => {
			if (deleted) {
				client.invalidateQueries({ queryKey: keys.all });
				client.invalidateQueries({ queryKey: keys.dashboard });
				client.invalidateQueries({ queryKey: keys.get(deleted.id) });
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
		onSuccess: (terminated) => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.get(terminated.id) });

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
		onSuccess: (restored) => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.get(restored.id) });

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
		onSuccess: (_, variables) => {
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.getUnits(variables.contractId) });
			client.invalidateQueries({
				queryKey: keys.getVacantUnits(variables.contractId, variables.complexId)
			});
			client.invalidateQueries({ queryKey: ['complexes', 'units'] });

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
		onSuccess: (removed) => {
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.getUnits(removed.contractId) });
			if (removed.complexId) {
				client.invalidateQueries({
					queryKey: keys.getVacantUnits(removed.contractId, removed.complexId)
				});
			}
			client.invalidateQueries({ queryKey: ['complexes', 'units'] });

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
		onSuccess: (created) => {
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.getPayments(created.contractId) });
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.get(created.contractId) });

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
		onSuccess: (updated) => {
			client.invalidateQueries({ queryKey: keys.dashboard });
			client.invalidateQueries({ queryKey: keys.getPayments(updated.contractId) });
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.get(updated.contractId) });

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
		onSuccess: (deleted) => {
			if (deleted) {
				client.invalidateQueries({ queryKey: keys.dashboard });
				client.invalidateQueries({ queryKey: keys.getPayments(deleted.contractId) });
				client.invalidateQueries({ queryKey: keys.all });
				client.invalidateQueries({ queryKey: keys.get(deleted.contractId) });
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
