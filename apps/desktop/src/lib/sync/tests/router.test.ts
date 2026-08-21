import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMINISTRATION_BY_ROLE, maskOf } from '@rentable/workspace-permission';

import { createApi, fakeIdentity } from '$lib/api/tests/testing.ts';
import { fakeHost, fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing.ts';
import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace.ts';

/**
 * RENAMING A WORKSPACE, THROUGH THE PROCEDURE
 *
 * The workspace's name lives in the control plane, so the procedure's whole job is to refuse a
 * name that could not be stored and otherwise hand the call to the host. What is worth pinning is
 * the refusing: the bound exists here as well as on the service so a caller is turned away before
 * a round trip rather than after one, and a bound that drifted would be invisible until somebody
 * typed a long name on a bad connection.
 *
 * Who may call it is `api/tests/procedure.test.ts`'s, with the rest of the boundary — except for
 * the one thing that is about *this* procedure rather than about the mechanism: it is
 * `procedure.permitted('renameWorkspace')`, so every test below has to say that its caller may
 * rename, and the last two are what make that a claim rather than a formality.
 */

/** a caller the workspace permits to rename it, which every test about the rename itself needs. */
const renamingApi = (host: ReturnType<typeof fakeHost>) =>
	createApi({ host, identity: fakeIdentity({ permissions: maskOf('renameWorkspace') }) });

/** a host that renames, and records what it was asked to call the workspace. */
function hostRecordingRenames(asked: string[]) {
	const state = fakeSyncState({ workspace: fakeWorkspace() });

	return fakeHost({
		remoteSync: {
			getState: async () => state,
			renewSession: async () => state,
			establishSession: async () => state,
			replicate: async () => ({ pushed: false, received: false }),
			push: async () => false,
			renameWorkspace: async (name: string) => {
				asked.push(name);

				return { ...state, workspace: { ...state.workspace, name } };
			}
		}
	});
}

test('a rename reaches the host and answers with what the workspace is now called', async () => {
	const asked: string[] = [];
	const api = await renamingApi(hostRecordingRenames(asked));

	const state = await api.app.remoteSync.rename({ name: 'دار السلام' });

	assert.deepEqual(asked, ['دار السلام']);
	assert.equal(state.workspace.name, 'دار السلام');
});

// The surrounding space is not part of what anybody named it, and the control plane stores the
// trimmed name either way. Trimming here is what stops the two disagreeing about what was sent.
test('and what reaches the host is trimmed', async () => {
	const asked: string[] = [];
	const api = await renamingApi(hostRecordingRenames(asked));

	await api.app.remoteSync.rename({ name: '  Jeddah  ' });

	assert.deepEqual(asked, ['Jeddah']);
});

test('a name with nothing in it is refused, and the host is never reached', async () => {
	for (const name of ['', '   ', '\t\n']) {
		const asked: string[] = [];
		const api = await renamingApi(hostRecordingRenames(asked));

		const refusal = await api.app.remoteSync.rename({ name }).then(
			() => null,
			(error: unknown) => error as { code?: string }
		);

		assert.equal(refusal?.code, 'BAD_REQUEST', JSON.stringify(name));
		assert.deepEqual(asked, [], 'a name that could not be stored cost a round trip');
	}
});

test('a name past what the control plane will store is refused here too, at the same bound', async () => {
	const asked: string[] = [];
	const api = await renamingApi(hostRecordingRenames(asked));

	const refusal = await api.app.remoteSync
		.rename({ name: 'n'.repeat(WORKSPACE_NAME_LIMIT + 1) })
		.then(
			() => null,
			(error: unknown) => error as { code?: string }
		);

	assert.equal(refusal?.code, 'BAD_REQUEST');
	assert.deepEqual(asked, []);
});

test('and a name at the bound goes through', async () => {
	const asked: string[] = [];
	const api = await renamingApi(hostRecordingRenames(asked));
	const atTheBound = 'n'.repeat(WORKSPACE_NAME_LIMIT);

	await api.app.remoteSync.rename({ name: atTheBound });

	assert.deepEqual(asked, [atTheBound]);
});

/**
 * **Criterion 7's other half: the procedure refuses whether or not the control was drawn.**
 *
 * The interface hides the button for this member, and that is a courtesy — nothing stops a caller
 * reaching the procedure another way, and this is what meets them when they do. The host is never
 * reached, so the refusal costs no round trip and changes nothing on the other side.
 */
test('a member the workspace does not permit to rename it is refused, and the host is never reached', async () => {
	const asked: string[] = [];
	const api = await createApi({
		host: hostRecordingRenames(asked),
		identity: fakeIdentity({ permissions: ADMINISTRATION_BY_ROLE.member })
	});

	const refusal = await api.app.remoteSync.rename({ name: 'not theirs to change' }).then(
		() => null,
		(error: unknown) => error as { code?: string }
	);

	assert.equal(refusal?.code, 'FORBIDDEN');
	assert.notEqual(refusal?.code, 'BAD_REQUEST', 'a valid name was refused as an invalid one');
	assert.deepEqual(asked, [], 'a rename nobody was permitted to make reached the host');
});

/**
 * **And a member holding every other act is refused just the same.** The named act is what decides
 * — not whether somebody administers *something*, which is the reading a role would have given.
 */
test('and so is a member holding every act except that one', async () => {
	const asked: string[] = [];
	const api = await createApi({
		host: hostRecordingRenames(asked),
		identity: fakeIdentity({
			permissions: maskOf(
				'inviteMember',
				'removeMember',
				'changeRole',
				'deleteWorkspace',
				'transferOwnership'
			)
		})
	});

	const refusal = await api.app.remoteSync.rename({ name: 'still not theirs' }).then(
		() => null,
		(error: unknown) => error as { code?: string }
	);

	assert.equal(refusal?.code, 'FORBIDDEN');
	assert.deepEqual(asked, []);
});
