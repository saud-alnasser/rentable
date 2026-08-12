import assert from 'node:assert/strict';
import { TRPCError } from '@trpc/server';
import { describe, it, mock } from 'node:test';

// both dependencies reach a `.svelte` file, which this harness cannot load. the substitutes
// are also the assertions: what the toast was asked to render, and which options the hook
// handed to the query client.
const raised = [];
const dismissed = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			// an announcement carrying nothing is recorded as the bare pair, so a test about the
			// message is not also a test about the options an offer adds.
			success: (message, options) => {
				raised.push(
					options ? { level: 'success', message, options } : { level: 'success', message }
				);

				return raised.length;
			},
			error: (message) => raised.push({ level: 'error', message }),
			dismiss: (id) => dismissed.push(id)
		}
	}
});

let boundClient;

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => boundClient,
		createMutation: (options) => options()
	}
});

const { applyRedo, applyUndo, declareMutation } = await import('$lib/design/mutation');
const { workspacePrefixes } = await import('$lib/design/query');
const { inverseStack } = await import('$lib/design/inverse');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// an offer names itself in the reader's language, so the announcement is only assertable
// once a locale is loaded — the same two calls the application makes at startup.
loadLocale('en');
setLocale('en');

function recordingClient() {
	const invalidated = [];

	return {
		invalidated,
		invalidateQueries: async (filters) => {
			invalidated.push(filters?.queryKey ?? null);
		}
	};
}

function bind(declaration) {
	boundClient = recordingClient();
	// the stack goes first: emptying it withdraws whatever offer the previous test left on
	// screen, and that withdrawal belongs to that test rather than to this one.
	inverseStack.clear();
	raised.length = 0;
	dismissed.length = 0;

	return { mutation: declareMutation(declaration)(), client: boundClient };
}

describe('a declared mutation', () => {
	it('calls the procedure it declared', async () => {
		const called = [];
		const { mutation } = bind({
			mutate: async (id) => {
				called.push(id);
				return { id };
			},
			touches: ['tenants']
		});

		assert.deepEqual(await mutation.mutationFn(7), { id: 7 });
		assert.deepEqual(called, [7]);
	});

	it('invalidates every workspace prefix on success', async () => {
		const { mutation, client } = bind({
			mutate: async () => undefined,
			touches: ['tenants']
		});

		await mutation.onSuccess();

		for (const prefix of Object.values(workspacePrefixes)) {
			assert.ok(
				client.invalidated.some((key) => JSON.stringify(key) === JSON.stringify(prefix)),
				`expected the ${JSON.stringify(prefix)} prefix to be invalidated`
			);
		}
	});

	// the one place two siblings differed: three deletions skipped invalidation when the
	// procedure reported nothing removed, and two invalidated regardless. the declaration
	// resolves it towards always invalidating — a redundant local refetch costs a
	// sub-millisecond query, where a skipped one shows a row that no longer exists.
	it('invalidates whatever the procedure returned', async () => {
		const prefixCount = Object.values(workspacePrefixes).length;

		for (const returned of [undefined, false, { id: 4 }]) {
			const { mutation, client } = bind({
				mutate: async () => returned,
				touches: ['contracts']
			});

			await mutation.onSuccess(returned);

			assert.equal(
				client.invalidated.length,
				prefixCount,
				`expected a procedure returning ${JSON.stringify(returned)} to invalidate regardless`
			);
		}
	});

	it('tells the user what the declaration says on success', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants'],
			toast: { success: () => 'tenant saved' }
		});

		await mutation.onSuccess();

		assert.deepEqual(raised, [{ level: 'success', message: 'tenant saved' }]);
	});

	it('shows a validation failure in the words the procedure raised it with', () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['contracts'],
			toast: { error: true, unexpected: () => 'unexpected' }
		});

		mutation.onError(new TRPCError({ code: 'BAD_REQUEST', message: 'unit is already assigned' }));

		assert.deepEqual(raised, [{ level: 'error', message: 'unit is already assigned' }]);
	});

	it('falls back to the declared sentence when the failure was not the user’s', () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['contracts'],
			toast: { error: false, unexpected: () => 'something went wrong' }
		});

		mutation.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(raised, [{ level: 'error', message: 'something went wrong' }]);
	});

	it('says nothing when the declaration asked for nothing', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['units']
		});

		await mutation.onSuccess();
		mutation.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(raised, []);
	});
});

function reversible(change, calls = []) {
	return {
		describe: () => change,
		undo: async () => calls.push(`undo ${change}`),
		redo: async () => calls.push(`redo ${change}`)
	};
}

/** a declaration that announces itself and can be taken back — the ordinary record change. */
function takeBackable(change, calls) {
	return {
		mutate: async () => undefined,
		touches: ['tenants'],
		toast: { success: () => `${change} done` },
		inverse: () => reversible(change, calls)
	};
}

describe('the offer to take a change back', () => {
	it('rides on the announcement the change already makes', async () => {
		const { mutation } = bind(takeBackable('deleting a tenant'));

		await mutation.onSuccess();

		assert.equal(raised.length, 1);
		assert.equal(raised[0].message, 'deleting a tenant done');
		assert.equal(raised[0].options.action.label, 'undo');
	});

	it('is absent from a change that declares no inverse', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants'],
			toast: { success: () => 'settings saved' }
		});

		await mutation.onSuccess();

		assert.deepEqual(raised, [{ level: 'success', message: 'settings saved' }]);
	});

	it('is absent where there is no announcement to ride on', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants'],
			inverse: () => reversible('deleting a tenant')
		});

		await mutation.onSuccess();

		assert.deepEqual(raised, []);
	});

	it('takes the change back, and the announcement of that offers to apply it again', async () => {
		const calls = [];
		const { mutation, client } = bind(takeBackable('deleting a tenant', calls));

		await mutation.onSuccess();
		await raised[0].options.action.onClick();

		assert.deepEqual(calls, ['undo deleting a tenant']);
		assert.equal(raised.at(-1).message, 'deleting a tenant undone');
		assert.equal(raised.at(-1).options.action.label, 'redo');

		await raised.at(-1).options.action.onClick();

		assert.deepEqual(calls, ['undo deleting a tenant', 'redo deleting a tenant']);
		assert.equal(raised.at(-1).message, 'deleting a tenant applied again');
		assert.equal(raised.at(-1).options.action.label, 'undo');
		assert.ok(client.invalidated.length > 0);
	});

	it('withdraws the offer outstanding when a newer change makes one', async () => {
		const { mutation } = bind(takeBackable('deleting a tenant'));

		await mutation.onSuccess();
		const first = raised.length;

		await mutation.onSuccess();

		assert.deepEqual(dismissed, [first]);
	});

	// an inverse is a statement about a database, and a sync pull or a workspace switch
	// replaces the one it was written against — the stack is emptied, and an offer still on
	// screen names a change nothing can take back.
	it('leaves with the stack, and does nothing if pressed anyway', async () => {
		const calls = [];
		const { mutation } = bind(takeBackable('deleting a tenant', calls));

		await mutation.onSuccess();
		const offered = raised.length;

		inverseStack.clear();

		assert.deepEqual(dismissed, [offered]);

		await raised[0].options.action.onClick();

		assert.deepEqual(calls, []);
		assert.equal(raised.length, 1);
	});

	it('reaches the keyboard, which names no change and moves whatever is on top', async () => {
		const calls = [];
		const { mutation, client } = bind(takeBackable('editing a tenant', calls));

		await mutation.onSuccess();
		await applyUndo(client);

		assert.deepEqual(calls, ['undo editing a tenant']);

		await applyRedo(client);

		assert.deepEqual(calls, ['undo editing a tenant', 'redo editing a tenant']);
	});

	it('says nothing when the keyboard reaches an empty stack', async () => {
		const { client } = bind(takeBackable('editing a tenant'));

		await applyUndo(client);
		await applyRedo(client);

		assert.deepEqual(raised, []);
	});
});
