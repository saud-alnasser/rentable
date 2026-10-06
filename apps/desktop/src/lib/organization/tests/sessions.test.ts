import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

/**
 * WHAT A SIGN-OUT-EVERYWHERE SAYS, AND WHAT A CHANGE OF ACCESS SAYS
 *
 * Requirement 22's last few feet. Both controls end in a number written on this machine's replica
 * and pushed, and a push that could not go leaves the other machines open; so the sentence is
 * chosen from what came back, and neither hook can declare one up front. The removal beside them
 * is the same shape for a different reason, and the access loops are the shape that had no hook
 * at all and announced themselves from the route.
 *
 * The three dependencies are substituted for the reason `mutation/tests/mutation.test.ts` gives:
 * two of them reach a `.svelte` file this runner cannot load, and the substitutes are also the
 * assertions. `createMutation` answers a hook with the very options it was handed, which is what
 * lets a test call `onSuccess` with an answer and read what was announced.
 */

/** one announcement the substituted toast was asked to render. */
type Announcement = { level: 'success' | 'error'; message: string };

const raised: Announcement[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (message: string) => raised.push({ level: 'success', message }),
			error: (message: string) => raised.push({ level: 'error', message }),
			warning: () => undefined,
			dismiss: () => undefined
		}
	}
});

/** the query keys the client was asked to invalidate, newest last. */
const invalidated: (readonly unknown[] | null)[] = [];

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({
			invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
				invalidated.push(filters?.queryKey ?? null);
			}
		}),
		createQuery: (options: () => unknown) => options(),
		createMutation: (options: () => unknown) => options()
	}
});

/** what the procedures were asked, so a loop's calls and their order are readable. */
const asked: string[] = [];

mock.module('$lib/api/caller', {
	exports: {
		default: {
			organization: {
				session: {
					machines: async () => {
						asked.push('machines');

						return [];
					}
				},
				workspace: {
					grant: async (input: { workspaceId: string; memberId: string; access: string }) => {
						asked.push(`grant:${input.workspaceId}:${input.memberId}:${input.access}`);
					},
					withdraw: async (input: { workspaceId: string; memberId: string }) => {
						asked.push(`withdraw:${input.workspaceId}:${input.memberId}`);
					}
				}
			}
		},
		forgetContext: () => undefined
	}
});

const { useChangeAccess } = await import('$lib/organization/access/query');
const { useEndMemberSessions, useRemoveMember } = await import('$lib/organization/member/query');
const { useEndMachine, useEndOtherSessions, useFetchMachines } =
	await import('$lib/organization/session/query');
const { bindingOf } = await import('#tests/mutation.ts');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { i18nObject } = await import('$lib/i18n/i18n-util');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

/** the locale the sentences are read in, set as the application sets it, with the log emptied. */
function reading(locale: 'en' | 'ar') {
	loadLocale(locale);
	setLocale(locale);
	raised.length = 0;
	invalidated.length = 0;
	asked.length = 0;

	return i18nObject(locale);
}

describe('signing out of your other machines', () => {
	it('says they were signed out once the bump has gone out', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useEndOtherSessions);

		await mutation.onSuccess({ sent: true }, undefined, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.settings.you.sessions.ended() }
		]);
	});

	it('says the sign-out is still to reach them where it could not be pushed', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useEndOtherSessions);

		await mutation.onSuccess({ sent: false }, undefined, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.settings.you.sessions.endedPending() }
		]);
		assert.notEqual(
			strings.settings.you.sessions.endedPending(),
			strings.settings.you.sessions.ended(),
			'the two answers say the same thing'
		);
	});

	it('says the pending one in the reader own language', async () => {
		const strings = reading('ar');
		const mutation = bindingOf(useEndOtherSessions);

		await mutation.onSuccess({ sent: false }, undefined, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.settings.you.sessions.endedPending() }
		]);
		assert.notEqual(
			strings.settings.you.sessions.endedPending(),
			i18nObject('en').settings.you.sessions.endedPending(),
			'the pending sentence was copied rather than written'
		);
	});
});

// effort 846, requirements 9 and 10: the machines are read under their own key, and one signed out
// from its row says which of the two things happened, of that machine, in the reader's language.
describe('your machines, and signing one out', () => {
	it('reads the machines under their own key, from the procedure', async () => {
		reading('en');
		const query = useFetchMachines() as unknown as {
			queryKey: readonly unknown[];
			queryFn: () => Promise<unknown>;
		};

		assert.deepEqual(query.queryKey, ['organization', 'machines']);
		assert.deepEqual(await query.queryFn(), []);
		assert.deepEqual(asked, ['machines']);
	});

	it('says the machine was signed out once it has gone out, and that it waits otherwise', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useEndMachine);

		await mutation.onSuccess({ sent: true }, { machineId: 'machine-laptop' }, undefined);
		await mutation.onSuccess({ sent: false }, { machineId: 'machine-laptop' }, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.settings.you.machines.ended() },
			{ level: 'success', message: strings.settings.you.machines.endedPending() }
		]);
		assert.notEqual(
			strings.settings.you.machines.endedPending(),
			strings.settings.you.sessions.endedPending(),
			'one machine is told it as every other machine is'
		);
		assert.deepEqual(invalidated, [
			['organization', 'machines'],
			['organization', 'machines']
		]);
	});

	it('says both in the reader own language', async () => {
		const strings = reading('ar');
		const mutation = bindingOf(useEndMachine);

		await mutation.onSuccess({ sent: true }, { machineId: 'machine-laptop' }, undefined);
		await mutation.onSuccess({ sent: false }, { machineId: 'machine-laptop' }, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.settings.you.machines.ended() },
			{ level: 'success', message: strings.settings.you.machines.endedPending() }
		]);
		assert.notEqual(
			strings.settings.you.machines.endedPending(),
			i18nObject('en').settings.you.machines.endedPending(),
			'the pending sentence was copied rather than written'
		);
	});

	it('signing every other machine out reads the machines again as well', async () => {
		reading('en');
		const mutation = bindingOf(useEndOtherSessions);

		await mutation.onSuccess({ sent: true }, undefined, undefined);

		assert.deepEqual(invalidated, [
			['organization', 'state'],
			['organization', 'machines']
		]);
	});
});

describe('signing a member out from their row', () => {
	it('chooses between the two sentences the same way', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useEndMemberSessions);

		await mutation.onSuccess({ sent: true }, { memberId: 'member-2' }, undefined);
		await mutation.onSuccess({ sent: false }, { memberId: 'member-2' }, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.organization.dashboard.sessionsEnded() },
			{ level: 'success', message: strings.organization.dashboard.sessionsEndedPending() }
		]);
	});

	it('says the pending one in the reader own language', async () => {
		const strings = reading('ar');
		const mutation = bindingOf(useEndMemberSessions);

		await mutation.onSuccess({ sent: false }, { memberId: 'member-2' }, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.organization.dashboard.sessionsEndedPending() }
		]);
		assert.notEqual(
			strings.organization.dashboard.sessionsEndedPending(),
			i18nObject('en').organization.dashboard.sessionsEndedPending(),
			'the pending sentence was copied rather than written'
		);
	});
});

describe('removing a member', () => {
	it('announces the removal it performed rather than the one it was asked for', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useRemoveMember);

		await mutation.onSuccess(
			{ memberId: 'member-2', lockedOut: false, rotatedWorkspaceIds: [], othersMustReconnect: 0 },
			{ memberId: 'member-2', lockOut: false },
			undefined
		);
		await mutation.onSuccess(
			{
				memberId: 'member-3',
				lockedOut: true,
				rotatedWorkspaceIds: ['workspace-1'],
				othersMustReconnect: 2
			},
			{ memberId: 'member-3', lockOut: true },
			undefined
		);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.organization.dashboard.removed() },
			{ level: 'success', message: strings.organization.dashboard.lockedOut({ count: 2 }) }
		]);
	});
});

describe('changing what a member may open', () => {
	it('writes each change in order and says once that they were saved', async () => {
		const strings = reading('en');
		const mutation = bindingOf(useChangeAccess);

		await mutation.mutationFn({
			changes: [
				{ workspaceId: 'workspace-1', memberId: 'member-2', access: 'full-access' },
				{ workspaceId: 'workspace-2', memberId: 'member-2', access: 'none' },
				{ workspaceId: 'workspace-3', memberId: 'member-2', access: 'read-only' }
			]
		});

		assert.deepEqual(asked, [
			'grant:workspace-1:member-2:full-access',
			'withdraw:workspace-2:member-2',
			'grant:workspace-3:member-2:read-only'
		]);
		assert.deepEqual(raised, [], 'a write in the set announced itself before the set was done');

		await mutation.onSuccess(undefined, { changes: [] }, undefined);

		assert.deepEqual(raised, [
			{ level: 'success', message: strings.organization.dashboard.accessSaved() }
		]);
		assert.deepEqual(invalidated, [], 'the list was refreshed before the set had settled');

		await mutation.onSettled?.();

		assert.deepEqual(invalidated, [
			['organization', 'members'],
			['organization', 'roles'],
			['organization', 'state']
		]);
	});

	it('a refusal part way still refreshes what the reader sees, since the writes before it stand', async () => {
		reading('en');
		const mutation = bindingOf(useChangeAccess);

		mutation.onError(new Error('only the owner can grant read only access'));
		await mutation.onSettled?.();

		assert.ok(
			raised.every((announcement) => announcement.level !== 'success'),
			'a refused set was announced as saved'
		);
		assert.deepEqual(invalidated, [
			['organization', 'members'],
			['organization', 'roles'],
			['organization', 'state']
		]);
	});
});
