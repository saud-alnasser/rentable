import api from '$lib/api/caller';
import type { features } from '$lib/app/features';
import { invalidateWorkspaceData, sharedPrefix } from './cache';
import {
	onMutationError,
	onMutationNotice,
	onMutationSuccess,
	type MutationOptions
} from './announcement';
import { historyKeys, type HistoryEntry } from '$lib/history';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { LL } from '$lib/i18n/i18n-svelte';
import {
	createMutation,
	useQueryClient,
	type MutationFunctionContext,
	type QueryClient,
	type QueryKey
} from '@tanstack/svelte-query';
import { recordInverse, type Inverse, type Settlement } from '$lib/undo';
import { get } from 'svelte/store';

/** What a mutation was called with, what came back, and what was read before it ran. */
export type MutationChange<TVariables, TResult, TCaptured> = {
	variables: TVariables;
	result: TResult;
	captured: TCaptured;
};

/**
 * What a declared mutation announces on success, which is a message plus the one thing no other
 * announcement in this application has: the change it is about.
 *
 * A mutation acting on a set has nothing to say without it. *Nine contracts terminated* is the
 * whole of what a reader wants from a bulk action, and until this existed the count was toasted
 * from the surface that called the mutation instead, so the rule that keeps announcements in one
 * place had an exception for every action acting on more than one record.
 *
 * It takes the same change {@link MutationDeclaration.inverse} and
 * {@link MutationDeclaration.records} take, rather than the result alone. Those two are the
 * neighbours a reader compares this against, and a third shape for the same three facts is a
 * third thing to remember; what a mutation was asked for is also part of what it did, which is
 * how *three of the five went through* is stated.
 *
 * **Answering with nothing withholds the announcement**, and a bulk action needs that as much as
 * it needs the count: a selection in which nothing could be changed has nothing to report, and
 * *0 contracts terminated* is a sentence about nothing.
 *
 * A declaration with nothing to read takes no parameter, which is the form every existing one
 * already has.
 */
type ToastSuccessMessage<TVariables, TResult, TCaptured> =
	string | ((change: MutationChange<TVariables, TResult, TCaptured>) => string | undefined);

/** What a declared mutation says, which is {@link MutationOptions}'s vocabulary plus the above. */
export type MutationToast<TVariables, TResult, TCaptured> = Omit<
	NonNullable<MutationOptions['toast']>,
	'success'
> & {
	success?: ToastSuccessMessage<TVariables, TResult, TCaptured>;
};

/** The last segment of a declared prefix, which is the concept it caches. */
type ConceptOf<P> = P extends readonly [...unknown[], infer Last extends string] ? Last : never;

/**
 * the workspace concepts a data mutation can write to: each record feature's, named by the last
 * segment of the prefix it declares. Known here by type alone, as `$lib/api/caller` knows the
 * root router: the list is the composition root's, and this capability sits below it.
 */
export type WorkspaceConcept = ConceptOf<
	Extract<(typeof features)[number], { prefix: unknown }>['prefix']
>;

/** One key a success writes, and what it writes there. */
export type QueryWrite = { key: QueryKey; data: unknown };

/**
 * One step of what a mutation invalidates: a key, or keys invalidated together. The steps of one
 * list run one after another, each waiting on the refetch before it, and the keys of one step
 * together.
 */
export type InvalidationStep = QueryKey | { together: readonly QueryKey[] };

/** What a refusal hands a declaration before it is said. */
export type MutationFailure<TVariables, TCaptured> = {
	error: Error;
	variables: TVariables;
	/** what {@link MutationDeclaration.capture} read, or nothing where it did not get to run. */
	captured: TCaptured | undefined;
};

/**
 * What varies between one data mutation and the next: the call it makes, what it writes, what
 * the user is told, and the call that reverses it. The hook a component calls, the cache
 * invalidation behind it and the undo entry are derived from this and written nowhere else
 * (ADR 0028).
 */
export type MutationDeclaration<TVariables, TResult, TCaptured = void> = {
	/**
	 * the procedure this mutation calls. The query library hands it the client it runs on as
	 * well, for a call that reads the cache on its way out.
	 */
	mutate: (variables: TVariables, context: MutationFunctionContext) => Promise<TResult>;
	/**
	 * the workspace concepts this mutation writes to, directly or through the reconcile pass
	 * it triggers.
	 *
	 * Invalidation is coarse and stays coarse in this effort — every concept is invalidated
	 * whatever this names — so today the set is a statement rather than a switch. Narrowing
	 * invalidation onto it later has to reckon with rows that *display* another concept's
	 * data, which a write-set does not name.
	 *
	 * A mutation writing a whole workspace's worth, an import, says `'every'` rather than naming
	 * each concept, so adding a kind does not edit it.
	 *
	 * **`'none'` is the one switch**: a mutation that writes no workspace data at all (the
	 * settings, the replica's state, the organization, the updater) leaves the workspace cache
	 * alone and names what it does refresh in {@link sets} and {@link invalidates}.
	 */
	touches: readonly WorkspaceConcept[] | 'every' | 'none';
	/**
	 * what the user is told. A mutation that declares none reports nothing, either way. It is
	 * the default: options handed to the hook replace it whole, as a hook's default parameter is
	 * replaced.
	 */
	toast?: MutationToast<TVariables, TResult, TCaptured>;
	/**
	 * the announcement chosen from what came back, said where the options in force name no
	 * success of their own. A caller that names one keeps it; answering with nothing says
	 * nothing.
	 */
	announces?: (change: MutationChange<TVariables, TResult, TCaptured>) => string | undefined;
	/**
	 * read what the inverse will need, before the mutation runs: the row an edit is about to
	 * overwrite, the row a deletion is about to remove. Whatever it resolves to reaches
	 * {@link inverse} untouched, and {@link failed} as well.
	 *
	 * A choice drawn ahead of its write, the appearance, is drawn here and answers with what it
	 * replaced, which {@link failed} puts back.
	 */
	capture?: (
		variables: TVariables,
		context: MutationFunctionContext
	) => Promise<TCaptured> | TCaptured;
	/**
	 * what a success does before anything is written or invalidated, for what the cache does not
	 * hold (a context to forget, the shell to tell) or a success whose writes turn on what came
	 * back. Answering `false` ends the success there: nothing is written, invalidated, recorded
	 * or announced.
	 */
	landed?: (
		change: MutationChange<TVariables, TResult, TCaptured>,
		client: QueryClient
	) => void | false | Promise<void | false>;
	/** the keys a success writes from what came back, before anything is invalidated. */
	sets?: (change: MutationChange<TVariables, TResult, TCaptured>) => readonly QueryWrite[];
	/**
	 * the keys a success invalidates besides the workspace's, after {@link sets}, in order. A key
	 * composed from a declared prefix is read when the success runs rather than while the module
	 * loads, so a list holding one is given as a function answering it.
	 */
	invalidates?:
		| readonly InvalidationStep[]
		| ((change: MutationChange<TVariables, TResult, TCaptured>) => readonly InvalidationStep[]);
	/**
	 * the keys invalidated once the mutation has settled, landed or refused, after it is said:
	 * for a set of writes where those before a refusal stand.
	 */
	settled?: readonly InvalidationStep[];
	/** what a refusal does before it is said: put back what {@link capture} drew, refresh a key. */
	failed?: (
		failure: MutationFailure<TVariables, TCaptured>,
		client: QueryClient
	) => void | Promise<void>;
	/**
	 * what this mutation leaves on the undo stack, given what it was called with and what came
	 * back. A mutation declaring none is outside undo, and nothing fails — the cost ADR 0026
	 * records and accepts.
	 *
	 * Declared beside {@link toast}, this is also what the announcement offers to take back:
	 * the offer is derived from the two and is not declared anywhere itself.
	 */
	inverse?: (change: MutationChange<TVariables, TResult, TCaptured>) => Inverse | undefined;
	/**
	 * what this mutation says when what it did differs from what the reader agreed to.
	 *
	 * **The fourth reader of the change, and the only one that is about a difference.** A
	 * multi-record action is planned before it is carried out, and the plan and the mutation read
	 * the same domain rule, so they cannot disagree about what refuses a record. They can still
	 * disagree about the *workspace*, because another device may write between the two. The
	 * mutation stays authoritative and this is how the reader is told, and nothing is retried on
	 * their behalf.
	 *
	 * **It is separate from {@link toast}'s announcement because the two are different events.**
	 * One says what was done and the other says what could not be, in a different tone, and a
	 * selection that went exactly as the confirmation showed raises the first and not the second.
	 *
	 * **What the reader agreed to arrives in the variables.** Two channels run before the mutation
	 * and reach here, and {@link MutationDeclaration.capture} is the other one, but it is handed
	 * only the variables itself: the variables are the one a *caller* can put the plan into. So for
	 * an action over a selection, what it was called with includes the outcome the reader was
	 * shown. {@link describeOutcomeChange} is the comparison, shared by every list that plans.
	 *
	 * **Answering with nothing withholds it**, which is the ordinary case.
	 */
	notice?: (change: MutationChange<TVariables, TResult, TCaptured>) => string | undefined;
	/**
	 * what this mutation leaves in the record's history, given the same three things.
	 *
	 * **A second consumer of this declaration, never a mechanism underneath it.** The journal is
	 * written from here for the same reason the undo entry is: pushing it down into the routers
	 * so it wrote itself would be the repository layer [[rules/api-layer]] rejects, arriving by
	 * another road.
	 *
	 * A mutation declaring none leaves no history and nothing fails — the same cost {@link
	 * inverse} already accepts, and the reason a mutation added without a declaration is absent
	 * from the account rather than able to break it.
	 */
	records?: (
		change: MutationChange<TVariables, TResult, TCaptured>
	) => HistoryEntry | HistoryEntry[] | undefined;
};

/**
 * What a declared mutation announces, given the change it is about.
 *
 * Resolved here rather than inside {@link onMutationSuccess}, because this is the only place a
 * change exists: that handler is also reached by surfaces with no declaration behind them, which
 * have none to hand it.
 */
function resolveAnnouncement<TVariables, TResult, TCaptured>(
	message: ToastSuccessMessage<TVariables, TResult, TCaptured> | undefined,
	change: MutationChange<TVariables, TResult, TCaptured>
) {
	// handed the change whichever form it takes; the form that does not want it declares no
	// parameter and ignores it, which is what makes the two one rule rather than two.
	return typeof message === 'function' ? message(change) : message;
}

/**
 * Append what happened to a record's account, and tell whatever is showing it.
 *
 * Never awaited into the change it describes: the change is what the reader asked for, and an
 * account that could not be written is a smaller failure than a change refused because its
 * account could not be. The invalidation afterwards is what stops a surface reading one change
 * behind — an entry is written after the workspace invalidation has already run.
 */
function recordHistory(client: QueryClient, recorded: HistoryEntry | HistoryEntry[] | undefined) {
	const entries = recorded ? [recorded].flat() : [];

	if (entries.length === 0) {
		return;
	}

	void api.history
		.append({ entries })
		.then(() => client.invalidateQueries({ queryKey: historyKeys.all(sharedPrefix()) }))
		.catch((failure) => {
			recordDiagnosticError('history.append', {
				concept: entries[0].concept,
				recordId: entries.map((entry) => entry.recordId).join(','),
				detail: failure instanceof Error ? failure.message : String(failure)
			});
		});
}

/**
 * How a change this layer put on the undo stack settles when it is moved: the same refresh and
 * the same account a declared mutation writes when it lands, and a failure said the way any
 * failed write is. Undo moves the stack and asks for these; it knows nothing of the cache.
 */
const settlement: Settlement = {
	refresh: invalidateWorkspaceData,
	record: recordHistory,
	fail: (failure) =>
		onMutationError(
			{ toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() } },
			failure
		)
};

/**
 * The workspace invalidation is unconditional for a mutation that touches the workspace at all: a
 * mutation that changed nothing costs one redundant local refetch, where a mutation that changed
 * something and skipped it shows the user a row that is no longer there. One that touches none
 * refreshes only the keys it names, in the order a success runs them: `landed`, `sets`,
 * `invalidates`, then the announcement.
 */
function bindMutation<TVariables, TResult, TCaptured>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>,
	client: QueryClient,
	options: MutationOptions | undefined
) {
	// the options a caller handed the hook replace the declared ones whole, the way a default
	// parameter is replaced. The refusal half is the shared vocabulary unchanged; only the
	// announcement can read a change, and it is resolved against one below.
	const { success, ...refusal } = (options ? options.toast : declaration.toast) ?? {};
	const announcement = success ?? declaration.announces;
	const settled = declaration.settled;

	return {
		mutationFn: declaration.mutate,
		onMutate: declaration.capture,
		onSuccess: async (result: TResult, variables: TVariables, captured: TCaptured) => {
			// the three things that happened, named once: what the mutation was asked for, what it
			// answered with, and what was read before it ran. Every declaration below takes it.
			const change = { variables, result, captured };
			// awaited only where it answers with a promise, so a success that does its part at once
			// reaches the announcement in the same turn it would have written by hand.
			const landed = declaration.landed?.(change, client);

			if ((landed instanceof Promise ? await landed : landed) === false) {
				return;
			}

			for (const { key, data } of declaration.sets?.(change) ?? []) {
				client.setQueryData(key, data);
			}

			const invalidates =
				typeof declaration.invalidates === 'function'
					? declaration.invalidates(change)
					: declaration.invalidates;

			for (const step of invalidates ?? []) {
				await invalidateStep(client, step);
			}

			if (declaration.touches !== 'none') {
				await invalidateWorkspaceData(client);
			}

			const inverse = declaration.inverse?.(change);

			if (inverse) {
				recordInverse(inverse, settlement);
			}

			// appended after the work landed, and never awaited into it: the change is what the
			// reader asked for, and an account that could not be written is a smaller failure than
			// a change refused because its account could not be.
			const entry = declaration.records?.(change);

			recordHistory(client, entry);

			onMutationSuccess(
				{ toast: { ...refusal, success: resolveAnnouncement(announcement, change) } },
				inverse && { client, change: inverse, direction: 'undo' }
			);

			// after what was done, because it is the smaller half of the same event: the reader
			// asked for a set, most of it happened, and this is the rest. Raised here rather than
			// by the surface that called the mutation, which is the whole of what makes it an
			// announcement like every other one.
			onMutationNotice(declaration.notice?.(change));
		},
		onError: (e: Error, variables: TVariables, captured: TCaptured | undefined) => {
			// the same rule as `landed`: waited on only where it answers with a promise.
			const failing = declaration.failed?.({ error: e, variables, captured }, client);

			if (failing instanceof Promise) {
				return failing.then(() => onMutationError({ toast: refusal }, e));
			}

			onMutationError({ toast: refusal }, e);
		},
		// only where one is declared, so a mutation without it hands the library what it did before.
		...(settled && {
			onSettled: async () => {
				for (const step of settled) {
					await invalidateStep(client, step);
				}
			}
		})
	};
}

/** Invalidate one step of a declared list: a key, or keys together. */
async function invalidateStep(client: QueryClient, step: InvalidationStep) {
	if ('together' in step) {
		await Promise.all(step.together.map((queryKey) => client.invalidateQueries({ queryKey })));

		return;
	}

	await client.invalidateQueries({ queryKey: step });
}

/**
 * Turn a declaration into the hook a component calls.
 *
 * This is what a concept's query module exports for each of its mutations. Adding a data
 * mutation means writing one declaration — the call, what it touches, what the user is told,
 * and how it is taken back — and nothing about the cache or the undo stack is written by hand.
 *
 * The hook takes options that replace the declared toast, for a caller that says something else,
 * and a client for a caller above the provider: the root layout draws the provider, so its own
 * script sits above the context the hook would otherwise read the client from.
 */
export function declareMutation<TVariables = void, TResult = unknown, TCaptured = void>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>
) {
	return (options?: MutationOptions, queryClient?: QueryClient) => {
		const client = queryClient ?? useQueryClient();

		return createMutation(
			() => bindMutation(declaration, client, options),
			queryClient && (() => queryClient)
		);
	};
}
