import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { MutationDeclaration } from '$lib/mutation';
import type { Inverse } from '$lib/undo';
import { bindingOf } from '#tests/mutation.ts';

// The offer an announcement carries, and the key that moves the same stack. Driven through a
// declared mutation, because that is the one writer of the stack and the one announcement an
// offer rides on: what is asserted is what the reader sees when a change lands and is moved.
//
// both dependencies reach a `.svelte` file, which this harness cannot load. the substitutes
// are also the assertions: what the toast was asked to render, and which options the hook
// handed to the query client.

/** the control an announcement carries when the change behind it can be moved back. */
type UndoOfferAction = { label: string; onClick: () => Promise<void> | undefined };

/** what an announcement carrying an offer is raised with. */
type UndoOfferOptions = { action: UndoOfferAction; duration: number };

/** one announcement the substituted toast was asked to render. */
type Announcement = {
	level: 'success' | 'error' | 'warning';
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
			warning: (message: string) => raised.push({ level: 'warning', message }),
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

const { declareMutation } = await import('$lib/mutation/ui');
const { applyRedo, applyUndo } = await import('$lib/undo');
const { inverseStack } = await import('$lib/undo/undo');
const { memberPermissions } = await import('$lib/permission');
const { EVERY_FLAG, maskOf } = await import('@rentable/workspace-permission');
// reached through the library's own accessor, so the client arrives typed as the one the
// mutation layer takes, and is the recorder above, because the library is substituted.
const { useQueryClient } = await import('@tanstack/svelte-query');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// the cache policy the root layout provides, built from the features' declarations: a settled
// mutation invalidates by it.
await import('$lib/app/cache');

// an offer names itself in the reader's language, so the announcement is only assertable
// once a locale is loaded, the same two calls the application makes at startup.
loadLocale('en');
loadLocale('ar');
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
	// drives, still typed by the variables and the result the declaration made concrete.
	return { mutation: bindingOf(declareMutation(declaration)), client: useQueryClient() };
}

function reversible(change: string, calls: string[] = []): Inverse {
	return {
		describe: () => change,
		flags: { undo: [], redo: [] },
		undo: async () => calls.push(`undo ${change}`),
		redo: async () => calls.push(`redo ${change}`)
	};
}

/** a declaration that announces itself and can be taken back, the ordinary record change. */
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

	// the offer rides on the announcement, so a bulk action that says nothing offers nothing,
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
	// replaces the one it was written against, the stack is emptied, and an offer still on
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

// effort 838, requirement 10: taking a change back is an act of its own, asking for the flags its
// procedures name, and a reader who may not take it is not offered it and is told why.
describe('a change the reader may not take back', () => {
	/** a tenant created, whose undo is a delete and whose redo is the create again. */
	function created(calls: string[]): MutationDeclaration<void, undefined> {
		return {
			mutate: async () => undefined,
			touches: ['tenants'],
			toast: { success: () => 'creating a tenant done' },
			inverse: () => ({
				...reversible('creating a tenant', calls),
				flags: { undo: ['deleteTenant'], redo: ['createTenant'] }
			})
		};
	}

	/** a reader holding every flag but these, on a full-access grant. */
	const holdingAllBut = (...lacking: string[]) =>
		memberPermissions.hold({
			permissions: maskOf(...EVERY_FLAG.filter((flag) => !lacking.includes(flag))),
			accessLevel: 'full-access'
		});

	it('is announced without the offer', async (context) => {
		context.after(() => memberPermissions.hold(null));
		holdingAllBut('deleteTenant');

		const { mutation } = bind(created([]));

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(raised, [{ level: 'success', message: 'creating a tenant done' }]);
	});

	it('is refused at the key with the flag it lacks, and nothing moves', async (context) => {
		context.after(() => memberPermissions.hold(null));
		holdingAllBut('deleteTenant');

		const calls: string[] = [];
		const { mutation, client } = bind(created(calls));

		await mutation.onSuccess(undefined, undefined, undefined);
		raised.length = 0;

		await applyUndo(client);

		assert.deepEqual(calls, []);
		assert.deepEqual(raised, [
			{ level: 'error', message: 'you do not have permission to delete tenants.' }
		]);
		assert.ok(inverseStack.undoable, 'the change stays on the stack, to be taken back later');
	});

	it('on a read-only grant, says the grant is why', async (context) => {
		context.after(() => memberPermissions.hold(null));
		memberPermissions.hold({ permissions: maskOf(...EVERY_FLAG), accessLevel: 'read-only' });

		const calls: string[] = [];
		const { mutation, client } = bind(created(calls));

		await mutation.onSuccess(undefined, undefined, undefined);
		raised.length = 0;

		await applyUndo(client);

		assert.deepEqual(calls, []);
		assert.deepEqual(raised, [
			{
				level: 'error',
				message: 'your access to this workspace is read only, so nothing in it can be changed.'
			}
		]);
	});

	it('is offered, and taken back, where the reader holds what it asks for', async (context) => {
		context.after(() => memberPermissions.hold(null));
		// the create is not the undo's to ask for, so lacking it leaves the undo open.
		holdingAllBut('createTenant');

		const calls: string[] = [];
		const { mutation } = bind(created(calls));

		await mutation.onSuccess(undefined, undefined, undefined);

		const offered = raised[0];

		assert.ok(offered.options, 'the undo is offered');
		await offered.options.action.onClick();

		assert.deepEqual(calls, ['undo creating a tenant']);
		// and the redo it would offer next asks for the create, which the reader lacks.
		assert.equal(raised.at(-1)?.options, undefined);
	});
});
