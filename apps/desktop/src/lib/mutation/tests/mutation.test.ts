import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { readRefusal, refuse } from '$lib/api/refusal.ts';

import type { MutationDeclaration, MutationOptions } from '$lib/mutation';
import { bindingOf } from '$lib/design/tests/testing.ts';

// both dependencies reach a `.svelte` file, which this harness cannot load. the substitutes
// are also the assertions: what the toast was asked to render, and which options the hook
// handed to the query client.

/** one announcement the substituted toast was asked to render. */
type Announcement = {
	level: 'success' | 'error' | 'warning';
	message: string;
	options?: object;
};

const raised: Announcement[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			// an announcement carrying nothing is recorded as the bare pair, so a test about the
			// message is not also a test about the options a second line adds.
			success: (message: string, options?: object) => {
				raised.push(
					options ? { level: 'success', message, options } : { level: 'success', message }
				);

				return raised.length;
			},
			error: (message: string) => raised.push({ level: 'error', message }),
			warning: (message: string) => raised.push({ level: 'warning', message })
		}
	}
});

/** the query keys the client was asked to invalidate, newest last. */
const invalidated: (readonly unknown[] | null)[] = [];

/**
 * Everything the client was asked, in order: `set` with the key and the data, and `start` and
 * `end` around an invalidation, so keys invalidated together read as two starts before their ends.
 */
const steps: string[] = [];

/**
 * The client every hook is handed here.
 *
 * `invalidateQueries` is the whole of what a workspace mutation asks a client for, and what it
 * was asked to invalidate is what these tests assert on; `setQueryData` is what a mutation outside
 * the workspace writes with.
 */
const recordingClient = {
	invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
		invalidated.push(filters?.queryKey ?? null);
		steps.push(`start ${JSON.stringify(filters?.queryKey)}`);
		await Promise.resolve();
		steps.push(`end ${JSON.stringify(filters?.queryKey)}`);
	},
	setQueryData: (key: readonly unknown[], data: unknown) => {
		steps.push(`set ${JSON.stringify(key)} ${JSON.stringify(data)}`);
	}
};

/** the client accessor the last hook handed the library, where it handed one. */
let handedClient: (() => unknown) | undefined;

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => recordingClient,
		createMutation: (options: () => unknown, client?: () => unknown) => {
			handedClient = client;

			return options();
		}
	}
});

const { declareMutation, describeOutcomeChange } = await import('$lib/mutation/ui');
// the policy the root layout provides, built from the features' declarations.
const { cachePolicy } = await import('$lib/app/cache');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');

// an announcement is worded in the reader's language, so it is only assertable once a locale is
// loaded, the same two calls the application makes at startup.
loadLocale('en');
loadLocale('ar');
setLocale('en');

function bind<TVariables, TResult, TCaptured = void>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>,
	options?: MutationOptions
) {
	raised.length = 0;
	invalidated.length = 0;
	steps.length = 0;

	// the hook answers with the binding it handed the substituted library, which is what a test
	// drives — still typed by the variables and the result the declaration made concrete.
	const hook = declareMutation(declaration);

	return { mutation: bindingOf(() => hook(options)) };
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

		for (const prefix of cachePolicy.prefixes) {
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
		const prefixCount = cachePolicy.prefixes.length;

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

	// effort 832, requirement 23: no failure a router raises reaches the reader in the English it
	// was raised with. Each is rendered in Arabic, and the message must not appear in what is shown.
	it('says every failure a router raises in the reader’s language, never its message', () => {
		setLocale('ar');

		try {
			const { mutation } = bind({
				mutate: async () => undefined,
				touches: ['contracts'],
				toast: { error: true }
			});
			const rejection = z.object({ amount: z.number().positive() }).safeParse({ amount: -1 });
			const failures = [
				new TRPCError({
					code: 'FORBIDDEN',
					message: 'this account does not hold createPayment in this workspace'
				}),
				new TRPCError({ code: 'UNAUTHORIZED', message: 'no account is signed in on this machine' }),
				new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no such table: payments' }),
				new TRPCError({ code: 'BAD_REQUEST', cause: rejection.error })
			];

			for (const failure of failures) {
				mutation.onError(failure);
			}

			assert.deepEqual(
				raised.map(({ message }) => message),
				[
					'دورك لا يسمح بهذا في مساحة العمل هذه.',
					'سجّل الدخول للقيام بهذا.',
					'حدث خطأ غير متوقع!',
					'بعض ما أُدخل غير صالح. راجعه وحاول مرة أخرى.'
				]
			);

			for (const [index, failure] of failures.entries()) {
				assert.doesNotMatch(raised[index].message, /[a-z]/i, `English reached the reader`);
				assert.ok(!raised[index].message.includes(failure.message));
			}
		} finally {
			setLocale('en');
		}
	});

	it('prefers the declared unexpected sentence for a failure nobody could act on', () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['contracts'],
			toast: { error: true, unexpected: () => 'something went wrong' }
		});

		mutation.onError(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'SQLITE_BUSY' }));
		mutation.onError(new Error('Cannot read properties of undefined'));

		assert.deepEqual(raised, [
			{ level: 'error', message: 'something went wrong' },
			{ level: 'error', message: 'something went wrong' }
		]);
	});

	// ticket 38: `error: false` hands a declaration's refusals to the form that places them. A caller
	// the middlewares turned away is not one of those, and reads as its own sentence either way.
	it('says a permission failure in its own sentence whether or not the declaration shows errors', () => {
		for (const error of [false, true]) {
			const { mutation } = bind({
				mutate: async () => undefined,
				touches: ['payments'],
				toast: { error, unexpected: () => 'something went wrong' }
			});

			mutation.onError(
				new TRPCError({
					code: 'FORBIDDEN',
					message: 'this account does not hold createPayment in this workspace'
				})
			);
			mutation.onError(
				new TRPCError({ code: 'UNAUTHORIZED', message: 'no account is signed in on this machine' })
			);

			assert.deepEqual(
				raised,
				[
					{ level: 'error', message: 'your role does not allow this in this workspace.' },
					{ level: 'error', message: 'sign in to do this.' }
				],
				`with error: ${error}`
			);
		}
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

	// effort 832, requirement 23: a refusal the shell raised is said from its reason, and Rust's
	// message, a developer's description in English, is never the toast.
	it('says a shell refusal in the reader’s words, whether or not a procedure wrapped it', () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['contracts'],
			toast: { error: true, unexpected: () => 'unexpected' }
		});
		const refused = {
			code: 'refused',
			reason: 'ownerOnly',
			message: 'only an owner can create a workspace. ask the owner'
		};

		mutation.onError(Object.assign(new Error(refused.message), refused));
		mutation.onError(
			new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: refused.message, cause: refused })
		);

		assert.deepEqual(raised, [
			{ level: 'error', message: 'only the owner can do this. ask the owner.' },
			{ level: 'error', message: 'only the owner can do this. ask the owner.' }
		]);
	});

	// a declaration that says one refusal in place keeps it out of the toast without the surface
	// raising the rest itself: the decider reads the error and answers null for that one.
	it('a decider keeps the refusal it names quiet and raises every other one', () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['contracts'],
			toast: {
				error: (error) => (readRefusal(error)?.code === 'contract.govIdTaken' ? null : true),
				unexpected: () => 'something went wrong'
			}
		});

		mutation.onError(refuse('contract.govIdTaken'));

		assert.deepEqual(raised, [], 'the refusal said in place was raised as a toast');

		mutation.onError(refuse('contract.endBeforeStart'));

		assert.deepEqual(raised, [{ level: 'error', message: 'end date must be after start date.' }]);
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
describe('what a mutation could not do', () => {
	/** a refusal in the shape every planned list answers with. */
	type Refusal = { id: string; name: string };

	/** a selection acted on, as the reader asked for it and as it turned out. */
	function planned(refused: Refusal[]) {
		return {
			mutate: async (call: { ids: string[]; foreseen: readonly string[] }) => ({
				ids: call.ids,
				refused
			}),
			touches: ['tenants' as const],
			notice: ({
				variables,
				result
			}: {
				variables: { ids: string[]; foreseen: readonly string[] };
				result: { ids: string[]; refused: Refusal[] };
			}) => describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.name)
		};
	}

	it('is announced when the workspace turned away more than the plan showed', async () => {
		const declaration = planned([{ id: 'b', name: 'Basim' }]);
		const { mutation } = bind(declaration);
		const variables = { ids: ['a', 'b'], foreseen: [] as readonly string[] };

		await mutation.onSuccess(await mutation.mutationFn(variables), variables, undefined);

		// a warning rather than a success: the mutation did not fail, and part of what was asked
		// for was no longer possible by the time it ran.
		assert.deepEqual(raised.filter((announcement) => announcement.level === 'warning').length, 1);
		assert.match(raised[raised.length - 1].message, /Basim/);
	});

	it('and says nothing when the outcome matched the plan', async () => {
		// the reader was already shown that this one would be turned away, so saying it again
		// reports the confirmation back to the person who read it.
		const declaration = planned([{ id: 'b', name: 'Basim' }]);
		const { mutation } = bind(declaration);
		const variables = { ids: ['a', 'b'], foreseen: ['b'] as readonly string[] };

		await mutation.onSuccess(await mutation.mutationFn(variables), variables, undefined);

		assert.deepEqual(raised, []);
	});

	it('and a declaration that reads nothing raises nothing', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: ['tenants' as const]
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(raised, []);
	});

	it('names only the records the confirmation did not account for', () => {
		const message = describeOutcomeChange(
			['shown'],
			[
				{ id: 'shown', name: 'Already said' },
				{ id: 'first', name: 'Abraj' },
				{ id: 'second', name: 'Burj' }
			],
			(refusal) => refusal.name
		);

		assert.ok(message);
		assert.match(message, /Abraj, Burj/);
		assert.doesNotMatch(message, /Already said/);
	});

	it('lands after what the action did, not before it', async () => {
		// two announcements about one act, and the reader reads what happened before what did not.
		const { mutation } = bind({
			mutate: async (call: { ids: string[]; foreseen: readonly string[] }) => ({
				done: call.ids.length,
				refused: [{ id: 'gone', name: 'Basim' }]
			}),
			touches: ['tenants' as const],
			toast: { success: () => 'one tenant deleted' },
			notice: ({
				variables,
				result
			}: {
				variables: { ids: string[]; foreseen: readonly string[] };
				result: { done: number; refused: Refusal[] };
			}) => describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.name)
		});
		const variables = { ids: ['kept', 'gone'], foreseen: [] as readonly string[] };

		await mutation.onSuccess(await mutation.mutationFn(variables), variables, undefined);

		assert.deepEqual(
			raised.map((announcement) => announcement.level),
			['success', 'warning']
		);
	});

	it('and answers with nothing where every refusal was foreseen', () => {
		assert.equal(
			describeOutcomeChange(['a', 'b'], [{ id: 'a', name: 'A' }], (refusal) => refusal.name),
			undefined
		);
		assert.equal(
			describeOutcomeChange([], [], (refusal: Refusal) => refusal.name),
			undefined
		);
	});
});

// effort 840, ticket 38: the mutations outside the workspace (settings, the replica's state, the
// organization, the updater) are declared too, and each keeps exactly what its hand-written hook did.
describe('a mutation outside the workspace', () => {
	it('leaves the workspace cache alone and reads no prefix', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: 'none',
			toast: { success: () => 'saved' }
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(invalidated, []);
		assert.deepEqual(raised, [{ level: 'success', message: 'saved' }]);
	});

	it('writes the keys it sets, then invalidates its own one after another, then announces', async () => {
		const { mutation } = bind({
			mutate: async () => ({ name: 'north' }),
			touches: 'none',
			toast: { success: () => 'renamed' },
			sets: ({ result }) => [{ key: ['state'], data: result }],
			invalidates: [['members'], ['state']]
		});

		await mutation.onSuccess({ name: 'north' }, undefined, undefined);

		assert.deepEqual(steps, [
			'set ["state"] {"name":"north"}',
			'start ["members"]',
			'end ["members"]',
			'start ["state"]',
			'end ["state"]'
		]);
		assert.deepEqual(raised, [{ level: 'success', message: 'renamed' }]);
	});

	it('invalidates the keys of one step together', async () => {
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: 'none',
			invalidates: [{ together: [['settings'], ['dashboard']] }]
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(steps, [
			'start ["settings"]',
			'start ["dashboard"]',
			'end ["settings"]',
			'end ["dashboard"]'
		]);
	});

	it('reads a list given as a function when the success runs, not when it is declared', async () => {
		let read = 0;
		const { mutation } = bind({
			mutate: async () => undefined,
			touches: 'none',
			invalidates: () => {
				read += 1;

				return [['dashboard']];
			}
		});

		assert.equal(read, 0);

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.equal(read, 1);
		assert.deepEqual(invalidated, [['dashboard']]);
	});

	it('runs what it does on landing first, and a landing that answers false ends the success', async () => {
		const landed: string[] = [];
		const declaration = {
			mutate: async (signedOut: boolean) => signedOut,
			touches: 'none' as const,
			toast: { success: () => 'up to date' },
			landed: ({ result }: { result: boolean }) => {
				landed.push(`landed ${steps.length}`);

				if (result) return false;
			},
			sets: () => [{ key: ['state'], data: 1 }],
			invalidates: [['state']]
		};

		const stopped = bind(declaration).mutation;

		await stopped.onSuccess(true, true, undefined);

		assert.deepEqual(steps, []);
		assert.deepEqual(raised, []);

		const went = bind(declaration).mutation;

		await went.onSuccess(false, false, undefined);

		assert.deepEqual(landed, ['landed 0', 'landed 0']);
		assert.deepEqual(steps, ['set ["state"] 1', 'start ["state"]', 'end ["state"]']);
		assert.deepEqual(raised, [{ level: 'success', message: 'up to date' }]);
	});

	it('announces what it chose from the answer where the options name no success', async () => {
		const declaration = {
			mutate: async () => ({ lockedOut: true }),
			touches: 'none' as const,
			toast: { error: true },
			announces: ({ result }: { result: { lockedOut: boolean } }) =>
				result.lockedOut ? 'locked out' : undefined
		};

		await bind(declaration).mutation.onSuccess({ lockedOut: true }, undefined, undefined);

		assert.deepEqual(raised, [{ level: 'success', message: 'locked out' }]);

		await bind(declaration).mutation.onSuccess({ lockedOut: false }, undefined, undefined);

		assert.deepEqual(raised, [], 'an answer with nothing to say was announced');

		// a caller that names its own sentence keeps it, and one that names none still hears the
		// chosen one, as the hand-written hooks merged them.
		await bind(declaration, { toast: { success: () => 'the caller’s' } }).mutation.onSuccess(
			{ lockedOut: true },
			undefined,
			undefined
		);

		assert.deepEqual(raised, [{ level: 'success', message: 'the caller’s' }]);

		await bind(declaration, {}).mutation.onSuccess({ lockedOut: true }, undefined, undefined);

		assert.deepEqual(raised, [{ level: 'success', message: 'locked out' }]);
	});

	it('takes the options a caller hands the hook in place of the declared toast, whole', async () => {
		const declaration = {
			mutate: async () => undefined,
			touches: 'none' as const,
			toast: { success: () => 'created', error: true, unexpected: () => 'declared unexpected' }
		};

		const quiet = bind(declaration, {
			toast: { error: true, unexpected: () => 'the caller’s unexpected' }
		}).mutation;

		await quiet.onSuccess(undefined, undefined, undefined);
		await quiet.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(raised, [{ level: 'error', message: 'the caller’s unexpected' }]);

		const silent = bind(declaration, {}).mutation;

		await silent.onSuccess(undefined, undefined, undefined);
		await silent.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(raised, []);
	});

	it('hands the library the client a caller above the provider gives it, and no client otherwise', () => {
		const hook = declareMutation({ mutate: async () => undefined, touches: 'none' });
		const client = { ...recordingClient };

		hook(undefined, client as never);

		assert.equal(handedClient?.(), client);

		hook();

		assert.equal(handedClient, undefined);
	});

	it('puts back what the capture drew before the refusal is said, and waits on a refresh', async () => {
		const drawn: string[] = [];
		const { mutation } = bind({
			mutate: async (appearance: string) => appearance,
			touches: 'none',
			toast: { error: true, unexpected: () => 'unexpected' },
			capture: (appearance) => {
				drawn.push(appearance);

				return { previous: 'light' };
			},
			failed: ({ captured }) => {
				if (captured) drawn.push(captured.previous);

				assert.deepEqual(raised, [], 'the refusal was said before the appearance was put back');
			}
		});

		const captured = await mutation.onMutate?.('dark');
		const answered = mutation.onError(new Error('SQLITE_BUSY'), 'dark', captured);

		assert.equal(answered, undefined, 'a rollback done at once was waited on');
		assert.deepEqual(drawn, ['dark', 'light']);
		assert.deepEqual(raised, [{ level: 'error', message: 'unexpected' }]);

		const refreshed = bind({
			mutate: async () => undefined,
			touches: 'none',
			toast: { error: true, unexpected: () => 'unexpected' },
			failed: async (_failure, client) => {
				await client.invalidateQueries({ queryKey: ['state'] });
			}
		}).mutation;

		await refreshed.onError(new Error('SQLITE_BUSY'));

		assert.deepEqual(steps, ['start ["state"]', 'end ["state"]']);
		assert.deepEqual(raised, [{ level: 'error', message: 'unexpected' }]);
	});

	it('invalidates what it settles on after success and refusal alike, and only where declared', async () => {
		assert.equal(
			bind({ mutate: async () => undefined, touches: 'none' }).mutation.onSettled,
			undefined
		);

		const { mutation } = bind({
			mutate: async () => undefined,
			touches: 'none',
			toast: { success: () => 'saved', error: true },
			settled: [['members'], ['state']]
		});

		await mutation.onSuccess(undefined, undefined, undefined);

		assert.deepEqual(invalidated, [], 'the keys were refreshed before the set had settled');

		await mutation.onSettled?.();

		assert.deepEqual(invalidated, [['members'], ['state']]);
	});

	it('hands the call the client it runs on', async () => {
		const { mutation } = bind({
			mutate: async (_: void, { client }) => client,
			touches: 'none'
		});

		const context = { client: recordingClient, meta: undefined, mutationKey: undefined };

		assert.equal(
			await (mutation.mutationFn as (v: void, c: typeof context) => Promise<unknown>)(
				undefined,
				context
			),
			recordingClient
		);
	});
});
