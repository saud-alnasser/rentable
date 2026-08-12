import assert from 'node:assert/strict';
import { TRPCError } from '@trpc/server';
import { describe, it, mock } from 'node:test';

// both dependencies reach a `.svelte` file, which this harness cannot load. the substitutes
// are also the assertions: what the toast was asked to render, and which options the hook
// handed to the query client.
const raised = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (message) => raised.push({ level: 'success', message }),
			error: (message) => raised.push({ level: 'error', message })
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

const { declareMutation } = await import('$lib/design/mutation');
const { workspacePrefixes } = await import('$lib/design/query');

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
	raised.length = 0;

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
