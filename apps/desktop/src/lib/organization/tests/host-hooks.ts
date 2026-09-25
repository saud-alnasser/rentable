import type { OrganizationMember, OrganizationRole, OrganizationSession } from '$lib/platform/host';

/**
 * THE ORGANIZATION HOST'S HOOKS, STOOD IN FOR
 *
 * Scaffolding rather than a test. The host in `organization/component/host.svelte` reads the
 * session and writes through the hooks in `organization/query.ts`, which reach a shell this
 * runner has none of. A test of what a card's act opens or writes replaces those hooks with these,
 * through a partial `vi.mock` of the query module, and reads what was asked of them:
 *
 * ```ts
 * vi.mock('$lib/organization/query', async (importOriginal) => ({
 * 	...(await importOriginal<typeof import('$lib/organization/query')>()),
 * 	...(await import('./host-hooks')).hostHooks
 * }));
 * ```
 *
 * `hostAnswers` is what the hooks answer: the session, members and roles they read, and a refusal per
 * write where a test wants one. `resetHostAnswers` belongs in a `beforeEach`.
 */

/** one write the host asked for: the hook, and what it was handed. */
export type HostWrite = { hook: string; input: unknown };

export const hostAnswers = {
	session: null as OrganizationSession | null,
	members: [] as OrganizationMember[],
	roles: [] as OrganizationRole[],
	writes: [] as HostWrite[],
	/** a write the shell refuses, by hook, with what it refuses it with. */
	refusals: {} as Record<string, Error>
};

export function resetHostAnswers() {
	hostAnswers.session = null;
	hostAnswers.members = [];
	hostAnswers.roles = [];
	hostAnswers.writes = [];
	hostAnswers.refusals = {};
}

/** a mutation hook that notes what it was asked, and refuses where the test said it would. */
const mutation = (hook: string) => () => ({
	isPending: false,
	mutateAsync: async (input?: unknown) => {
		hostAnswers.writes.push({ hook, input });

		const refusal = hostAnswers.refusals[hook];

		if (refusal) throw refusal;

		return hook === 'useMakeMemberLink'
			? { link: 'rentable://join/link', code: 'ABC234', expiresAt: 0 }
			: undefined;
	}
});

/** what the host's hooks are replaced with. */
export const hostHooks = {
	useFetchOrganizationState: () => ({
		get data() {
			return hostAnswers.session ? { session: hostAnswers.session } : undefined;
		},
		refetch: async () => undefined
	}),
	useFetchMembers: () => ({
		get data() {
			return hostAnswers.members;
		}
	}),
	useFetchRoles: () => ({
		get data() {
			return hostAnswers.roles;
		}
	}),
	useLockOutCost: () => ({ data: undefined }),
	useRenameMember: mutation('useRenameMember'),
	useAssignRole: mutation('useAssignRole'),
	useSetOverride: mutation('useSetOverride'),
	useCreateRole: mutation('useCreateRole'),
	useRenameRole: mutation('useRenameRole'),
	useSetRoleMask: mutation('useSetRoleMask'),
	useMoveRole: mutation('useMoveRole'),
	useDeleteRole: mutation('useDeleteRole'),
	useChangeAccess: mutation('useChangeAccess'),
	useOfferOwnership: mutation('useOfferOwnership'),
	useWithdrawOffer: mutation('useWithdrawOffer'),
	useRemoveMember: mutation('useRemoveMember'),
	useMakeMemberLink: mutation('useMakeMemberLink'),
	useUnsetMemberPassword: mutation('useUnsetMemberPassword'),
	useEndMemberSessions: mutation('useEndMemberSessions'),
	useDeleteWorkspace: mutation('useDeleteWorkspace')
};
