import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { TRPCError } from '@trpc/server';

import type { Inverse } from '$lib/design/inverse.ts';
import type { MutationDeclaration } from '$lib/design/mutation.ts';
import { bindingOf } from '$lib/design/tests/testing.ts';

// both dependencies reach a `.svelte` file, which this harness cannot load. the substitutes
// are also the assertions: what the toast was asked to render, and which options the hook
// handed to the query client.

/** the control an announcement carries when the change behind it can be moved back. */
type UndoOfferAction = { label: string; onClick: () => Promise<void> | undefined };

/** what an announcement carrying an offer is raised with. */
type UndoOfferOptions = { action: UndoOfferAction; duration: number };

/** one announcement the substituted toast was asked to render. */
type Announcement = {
	level: 'success' | 'error';
	message: string;
	options?: UndoOfferOptions;
};

const raised: Announcement[] = [];
const dismissed: (string | number)[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			// an announcement carrying nothing is recorded as the bare pair, so a test about the
			// message is not also a test about the options an offer adds.
			success: (message: string, options?: UndoOfferOptions) => {
				raised.push(
					options ? { level: 'success', message, options } : { level: 'success', message }
				);

				return raised.length;
			},
			error: (message: string) => raised.push({ level: 'error', message }),
			dismiss: (id: string | number) => dismissed.push(id)
		}
	}
});

/** the query keys the client was asked to invalidate, newest last. */
const invalidated: (readonly unknown[] | null)[] = [];

/**
 * The client every hook is handed here.
 *
 * `invalidateQueries` is the whole of what the mutation layer asks a client for, and what it
 * was asked to invalidate is what these tests assert on.
 */
const recordingClient = {
	invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
		invalidated.push(filters?.queryKey ?? null);
	}
};

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => recordingClient,
		createMutation: (options: () => unknown) => options()
	}
});

const { applyRedo, applyUndo, declareMutation } = await import('$lib/design/mutation');
const { workspacePrefixes } = await import('$lib/design/query');
const { inverseStack } = await import('$lib/design/inverse');
// reached through the library's own accessor, so the client arrives typed as the one the
// mutation layer takes — and is the recorder above, because the library is substituted.
const { useQueryClient } = await import('@tanstack/svelte-query');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// an offer names itself in the reader's language, so the announcement is only assertable
// once a locale is loaded — the same two calls the application makes at startup.
loadLocale('en');
setLocale('en');

function bind<TVariables, TResult, TCaptured = void>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>
) {
	// the stack goes first: emptying it withdraws whatever offer the previous test left on
	// screen, and that withdrawal belongs to that test rather than to this one.
	inverseStack.clear();
	raised.length = 0;
	dismissed.length = 0;
	invalidated.length = 0;

	// the hook answers with the binding it handed the substituted library, which is what a test
	// drives — still typed by the variables and the result the declaration made concrete.
	return { mutation: bindingOf(declareMutation(declaration)), client: useQueryClient() };
}

describe('a declared mutation', () => {
	it('calls the procedure it declared', async () => {
		const called: number[] = [];
		const { mutation } = bind({
			mutate: async (id: number) => {
				called.push(id);
				return { id };
			},
			touches: ['tenants']
		});

		assert.deepEqual(await mutation.mutationFn(7), { id: 7 });
		assert.deepEqual(called, [7]);
	});

	it('invalidates every workspace prefix on success', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants']
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		for (const prefix of Object.values(workspacePrefixes)) {
			assert.ok(
				invalidated.some((key) => JSON.stringify(key) === JSON.stringify(prefix)),
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
			const { mutation } = bind({
				mutate: async () => returned,
				touches: ['contracts']
			});

			await mutation.onSuccess(returned, undefined, undefined);

			assert.equal(
				invalidated.length,
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

		await mutation.onSuccess(undefined, undefined, undefined);

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

	// an action over a set has nothing worth saying without this: how many of the twelve went
	// through is the one thing the reader cannot see for themselves, and before this the
	// declaration could not carry it and the surface that called the mutation toasted it instead.
	it('can say what the procedure answered with', async () => {
		const { mutation } = bind({
			mutate: async (ids: string[]) => ({ terminated: ids.slice(1) }),
			touches: ['contracts'],
			toast: { success: ({ result }) => `${result.terminated.length} terminated` }
		});

		const result = await mutation.mutationFn(['a', 'b', 'c']);

		await mutation.onSuccess(result, ['a', 'b', 'c'], undefined);

		assert.deepEqual(raised, [{ level: 'success', message: '2 terminated' }]);
	});

	it('and says nothing where the answer is that nothing happened', async () => {
		const { mutation } = bind({
			mutate: async () => ({ terminated: [] as string[] }),
			touches: ['contracts'],
			toast: {
				success: ({ result }) =>
					result.terminated.length > 0 ? `${result.terminated.length} terminated` : undefined
			}
		});

		await mutation.onSuccess({ terminated: [] }, undefined, undefined);

		assert.deepEqual(raised, []);
	});

	// the older form is a function of nothing, and it stays one. Both are handed the result and
	// the one that declares no parameter ignores it, which is what keeps this one rule.
	it('and a message that reads nothing is still resolved when it is raised', async () => {
		const { mutation } = bind({
			mutate: async () => ({ id: 4 }),
			touches: ['contracts'],
			toast: { success: () => 'contract saved' }
		});

		await mutation.onSuccess({ id: 4 }, undefined, undefined);

		assert.deepEqual(raised, [{ level: 'success', message: 'contract saved' }]);
	});

	it('says nothing when the declaration asked for nothing', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['units']
		});

		await mutation.onSuccess(undefined, undefined, undefined);
		mutation.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(raised, []);
	});
});

function reversible(change: string, calls: string[] = []): Inverse {
	return {
		describe: () => change,
		undo: async () => calls.push(`undo ${change}`),
		redo: async () => calls.push(`redo ${change}`)
	};
}

/** a declaration that announces itself and can be taken back — the ordinary record change. */
function takeBackable(change: string, calls?: string[]): MutationDeclaration<void, undefined> {
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

		await mutation.onSuccess(undefined, undefined, undefined);

		const announcement = raised[0];

		assert.equal(raised.length, 1);
		assert.equal(announcement.message, 'deleting a tenant done');
		assert.ok(announcement.options);
		assert.equal(announcement.options.action.label, 'undo');
	});

	it('is absent from a change that declares no inverse', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants'],
			toast: { success: () => 'settings saved' }
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(raised, [{ level: 'success', message: 'settings saved' }]);
	});

	// the offer rides on the announcement, so a bulk action that says nothing offers nothing —
	// which is right, because a bulk action that changed nothing declares no inverse either.
	it('rides on an announcement that read the result, and goes with one that said nothing', async () => {
		const declaration: MutationDeclaration<string[], { deleted: string[] }> = {
			mutate: async (ids) => ({ deleted: ids }),
			touches: ['contracts'],
			toast: {
				success: ({ result }) =>
					result.deleted.length > 0 ? `${result.deleted.length} deleted` : undefined
			},
			inverse: ({ result }) =>
				result.deleted.length === 0 ? undefined : reversible('deleting 2 contracts')
		};

		const spoken = bind(declaration);

		await spoken.mutation.onSuccess({ deleted: ['a', 'b'] }, ['a', 'b'], undefined);

		assert.equal(raised.length, 1);
		assert.equal(raised[0].message, '2 deleted');
		assert.ok(raised[0].options, 'the offer rides on the announcement');

		const silent = bind(declaration);

		await silent.mutation.onSuccess({ deleted: [] }, [], undefined);

		assert.deepEqual(raised, []);
	});

	it('is absent where there is no announcement to ride on', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants'],
			inverse: () => reversible('deleting a tenant')
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(raised, []);
	});

	it('takes the change back, and the announcement of that offers to apply it again', async () => {
		const calls: string[] = [];
		const { mutation } = bind(takeBackable('deleting a tenant', calls));

		await mutation.onSuccess(undefined, undefined, undefined);

		const offered = raised[0];

		assert.ok(offered.options);
		await offered.options.action.onClick();

		const undone = raised.at(-1);

		assert.deepEqual(calls, ['undo deleting a tenant']);
		assert.ok(undone);
		assert.equal(undone.message, 'deleting a tenant undone');
		assert.ok(undone.options);
		assert.equal(undone.options.action.label, 'redo');

		await undone.options.action.onClick();

		const applied = raised.at(-1);

		assert.deepEqual(calls, ['undo deleting a tenant', 'redo deleting a tenant']);
		assert.ok(applied);
		assert.equal(applied.message, 'deleting a tenant applied again');
		assert.ok(applied.options);
		assert.equal(applied.options.action.label, 'undo');
		assert.ok(invalidated.length > 0);
	});

	it('withdraws the offer outstanding when a newer change makes one', async () => {
		const { mutation } = bind(takeBackable('deleting a tenant'));

		await mutation.onSuccess(undefined, undefined, undefined);
		const first = raised.length;

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(dismissed, [first]);
	});

	// an inverse is a statement about a database, and a sync pull or a workspace switch
	// replaces the one it was written against — the stack is emptied, and an offer still on
	// screen names a change nothing can take back.
	it('leaves with the stack, and does nothing if pressed anyway', async () => {
		const calls: string[] = [];
		const { mutation } = bind(takeBackable('deleting a tenant', calls));

		await mutation.onSuccess(undefined, undefined, undefined);
		const offered = raised.length;

		inverseStack.clear();

		assert.deepEqual(dismissed, [offered]);

		const announcement = raised[0];

		assert.ok(announcement.options);
		await announcement.options.action.onClick();

		assert.deepEqual(calls, []);
		assert.equal(raised.length, 1);
	});

	it('reaches the keyboard, which names no change and moves whatever is on top', async () => {
		const calls: string[] = [];
		const { mutation, client } = bind(takeBackable('editing a tenant', calls));

		await mutation.onSuccess(undefined, undefined, undefined);
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
