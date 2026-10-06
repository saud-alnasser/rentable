import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

/**
 * EVERY WRITE TO THE ORGANIZATION READS ITS CARDS AGAIN
 *
 * The members, the roles and where this machine stands are drawn from rows the others change: a
 * role card counts its holders, a member card and a workspace card count the workspaces and the
 * people on each, and the workspaces this reader holds, with their names, are the state's. A write
 * that refreshed only the key it thought of left a card one change behind until its section was
 * drawn again, which is how a renamed workspace kept its old name on its card (effort 851). So
 * every write to the organization's database refreshes all three (`organizationChanged`), and this
 * reads that it does, write by write.
 *
 * The dependencies are substituted for the reason `mutation/tests/mutation.test.ts` gives: two of
 * them reach a `.svelte` file this runner cannot load, and the client's substitute is also the
 * assertion.
 */

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: () => undefined,
			error: () => undefined,
			warning: () => undefined,
			dismiss: () => undefined
		}
	}
});

/** the query keys the client was asked to invalidate, newest last. */
const invalidated: string[] = [];

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({
			invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
				invalidated.push(JSON.stringify(filters?.queryKey ?? null));
			},
			setQueryData: () => undefined
		}),
		createQuery: (options: () => unknown) => options(),
		createMutation: (options: () => unknown) => options()
	}
});

// no procedure is called here: what is read is what a success refreshes.
mock.module('$lib/api/caller', { exports: { default: {}, forgetContext: () => undefined } });

mock.module('$lib/platform/tauri', {
	exports: { tauri: { diagnostics: { write: async () => {} } } }
});

const members = await import('$lib/organization/member/query');
const roles = await import('$lib/organization/role/query');
const access = await import('$lib/organization/access/query');
const workspaces = await import('$lib/organization/workspace/query');
const organization = await import('$lib/organization/query');
const { useRenameWorkspace } = workspaces;
const { syncKeys } = await import('$lib/sync/ui');
const { fakeSyncState } = await import('$lib/sync/tests/testing.ts');
const { bindingOf } = await import('#tests/mutation.ts');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

loadLocale('en');
setLocale('en');

beforeEach(() => {
	invalidated.length = 0;
});

const { keys } = organization;

/** what every organization write must read again, whatever else it reads. */
const REFRESHED = [keys.members, keys.roles, keys.state].map((key) => JSON.stringify(key));

/**
 * each write, with what its procedure answers. The answer matters only where the announcement is
 * chosen from it; the rest answer with nothing.
 */
const writes: [string, () => unknown, unknown][] = [
	['make an account', members.useCreateAccount, undefined],
	['remove a member', members.useRemoveMember, { lockedOut: false, othersMustReconnect: 0 }],
	['rename a member', members.useRenameMember, undefined],
	["end a member's sessions", members.useEndMemberSessions, { sent: true }],
	['unlock a member', members.useUnlockMember, undefined],
	['give a member a role', members.useAssignRole, undefined],
	["set a member's override", members.useSetOverride, undefined],
	['offer the organization', members.useOfferOwnership, undefined],
	['withdraw the offer', members.useWithdrawOffer, undefined],
	['accept the organization', members.useAcceptOwnership, undefined],
	['make a link', members.useMakeMemberLink, { unreachableWorkspaces: [] }],
	["unset a member's password", members.useUnsetMemberPassword, []],
	['create a role', roles.useCreateRole, undefined],
	['rename a role', roles.useRenameRole, undefined],
	["set a role's flags", roles.useSetRoleMask, undefined],
	['move a role', roles.useMoveRole, undefined],
	['delete a role', roles.useDeleteRole, undefined],
	['tailor a workspace for a member', access.useSetWorkspaceOverride, undefined],
	['create a workspace', () => workspaces.useCreateWorkspace(), undefined],
	['delete a workspace', workspaces.useDeleteWorkspace, undefined],
	['rename the organization', organization.useRenameOrganization, {}],
	['rename the workspace', useRenameWorkspace, fakeSyncState()]
];

describe('a write to the organization', () => {
	for (const [name, hook, result] of writes) {
		it(`reads the members, the roles and the state again: ${name}`, async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mutation = bindingOf(hook as any);

			await mutation.onSuccess(result, undefined, undefined);

			for (const key of REFRESHED) {
				assert.ok(invalidated.includes(key), `${name} left ${key} as it was`);
			}
		});
	}

	it('reads them again once a change of access settles, landed or refused', async () => {
		const mutation = bindingOf(access.useChangeAccess);

		await mutation.onSettled?.();

		assert.deepEqual(invalidated, REFRESHED);
	});

	it("reads the replica's state again as well when the workspace is renamed", async () => {
		const mutation = bindingOf(useRenameWorkspace);

		await mutation.onSuccess(fakeSyncState(), { name: 'South' }, undefined);

		assert.deepEqual(invalidated, [JSON.stringify(syncKeys.remoteSync), ...REFRESHED]);
	});
});
