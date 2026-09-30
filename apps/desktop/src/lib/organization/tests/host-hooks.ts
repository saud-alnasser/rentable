import type {
	MemberStanding,
	OrganizationMember,
	OrganizationRole,
	OrganizationSession
} from '$lib/organization/host';
import type { RemoteSyncState } from '$lib/sync/host';

/**
 * THE ORGANIZATION HOST'S HOOKS, STOOD IN FOR
 *
 * Scaffolding rather than a test. The host in `organization/component/host.svelte` reads the
 * session and writes through the hooks in `organization/query.ts` and each sub-concept's own
 * (`member/query.ts`, `role/query.ts`, `access/query.ts`, `workspace/query.ts`,
 * `session/query.ts`), which reach a shell this runner has none of. A test of what a card's act
 * opens or writes replaces those hooks with these, through a partial `vi.mock` of each query
 * module, and reads what was asked of them:
 *
 * ```ts
 * vi.mock('$lib/organization/query', async (importOriginal) => ({
 * 	...(await importOriginal<typeof import('$lib/organization/query')>()),
 * 	...(await import('./host-hooks')).hostHooks
 * }));
 * ```
 *
 * and the same block for every sub-concept's module, `$lib/organization/member/query` and the rest:
 * a hook this stands in for is whichever module declares it, and a module mocked with every hook
 * holds the ones it does not declare harmlessly.
 *
 * `hostAnswers` is what the hooks answer: the session, members and roles they read, and a refusal per
 * write where a test wants one. `resetHostAnswers` belongs in a `beforeEach`.
 *
 * The sections the organization contributes to the settings area read and write through the same
 * module, and the sync record beside it, so a test drawing the area stands in for both the same
 * way, the sync query's read with `syncHooks`:
 *
 * ```ts
 * vi.mock('$lib/sync/query', async (importOriginal) => ({
 * 	...(await importOriginal<typeof import('$lib/sync/query')>()),
 * 	...(await import('$lib/organization/tests/host-hooks')).syncHooks
 * }));
 * ```
 */

/** one write the host asked for: the hook, and what it was handed. */
export type HostWrite = { hook: string; input: unknown };

export const hostAnswers = {
	session: null as OrganizationSession | null,
	/** whether this machine holds the Turso authority, as the organization's state says. */
	holdsTursoAuthority: false,
	members: [] as OrganizationMember[],
	/** where each member stands, as the members section draws it in a line. */
	standings: [] as MemberStanding[],
	roles: [] as OrganizationRole[],
	/** the machine's sync record; `null` until it has been read, and while signed out. */
	syncState: null as RemoteSyncState | null,
	writes: [] as HostWrite[],
	/** a write the shell refuses, by hook, with what it refuses it with. */
	refusals: {} as Record<string, Error>
};

export function resetHostAnswers() {
	hostAnswers.session = null;
	hostAnswers.holdsTursoAuthority = false;
	hostAnswers.members = [];
	hostAnswers.standings = [];
	hostAnswers.roles = [];
	hostAnswers.syncState = null;
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
			return hostAnswers.session
				? {
						session: hostAnswers.session,
						holdsTursoAuthority: hostAnswers.holdsTursoAuthority
					}
				: undefined;
		},
		refetch: async () => undefined
	}),
	useFetchMembers: () => ({
		get data() {
			return hostAnswers.members;
		}
	}),
	useFetchMemberStandings: () => ({
		get data() {
			return hostAnswers.standings;
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
	useSetWorkspaceOverride: mutation('useSetWorkspaceOverride'),
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
	useDeleteWorkspace: mutation('useDeleteWorkspace'),
	useChangePassword: mutation('useChangePassword'),
	useAcceptOwnership: mutation('useAcceptOwnership'),
	useEndOtherSessions: mutation('useEndOtherSessions'),
	useDeleteOrganization: mutation('useDeleteOrganization'),
	useDisconnectOrganization: mutation('useDisconnectOrganization')
};

/** what the sync query's read of the sync record is replaced with. */
export const syncHooks = {
	useFetchRemoteSyncState: () => ({
		get data() {
			return hostAnswers.syncState ?? undefined;
		}
	})
};
