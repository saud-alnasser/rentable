import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { keys, organizationChanged } from '$lib/organization/query';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE ORGANIZATION'S ROLES
 *
 * Every role, and the writes the roles block and the role editor make to one.
 */

/**
 * every role, highest rank first, with what each carries and how many hold it (effort 838,
 * requirement 12). Any signed-in member reads it.
 */
export function useFetchRoles(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.roles,
		queryFn: () => api.organization.role.list(),
		enabled: enabled()
	}));
}

/** what every role write announces with: its own sentence, and the shared refusal. */
const roleWrite = (success: () => string) => ({
	success,
	error: true,
	unexpected: () => get(LL).common.messages.unexpectedError()
});

/** make a custom role, directly below another. */
export const useCreateRole = declareMutation({
	mutate: (input: { name: string; mask: number; afterRoleId: string }) =>
		api.organization.role.create(input),
	touches: 'none',
	toast: roleWrite(() => get(LL).organization.roleList.created()),
	invalidates: [organizationChanged]
});

/** rename a custom role. */
export const useRenameRole = declareMutation({
	mutate: (input: { roleId: string; name: string }) => api.organization.role.rename(input),
	touches: 'none',
	toast: roleWrite(() => get(LL).organization.roleList.saved()),
	invalidates: [organizationChanged]
});

/** change what a role carries; every holder's permissions follow. */
export const useSetRoleMask = declareMutation({
	mutate: (input: { roleId: string; mask: number }) => api.organization.role.setMask(input),
	touches: 'none',
	toast: roleWrite(() => get(LL).organization.roleList.saved()),
	invalidates: [organizationChanged]
});

/** move a custom role to directly below another. */
export const useMoveRole = declareMutation({
	mutate: (input: { roleId: string; afterRoleId: string }) => api.organization.role.move(input),
	touches: 'none',
	toast: roleWrite(() => get(LL).organization.roleList.moved()),
	invalidates: [organizationChanged]
});

/** delete a custom role; whoever held it holds the member role. */
export const useDeleteRole = declareMutation({
	mutate: (input: { roleId: string }) => api.organization.role.delete(input),
	touches: 'none',
	toast: roleWrite(() => get(LL).organization.roleList.deleted()),
	invalidates: [organizationChanged]
});
