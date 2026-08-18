import api from '$lib/api/caller';
import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import { historyKeys, type HistoryEntry } from '$lib/history/history';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { inverseStack, type Inverse } from '$lib/design/inverse';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { TRPCError } from '@trpc/server';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';

type ToastMessage = string | (() => string);
type ToastErrorMessage = Exclude<
	NonNullable<MutationOptions['toast']>['error'],
	boolean | undefined
>;

export type MutationOptions = {
	toast?: {
		success?: ToastMessage;
		error?: boolean | ToastMessage;
		unexpected?: ToastMessage;
	};
};

/** the workspace concepts a data mutation can write to. */
export type WorkspaceConcept = keyof typeof workspacePrefixes;

/**
 * What varies between one data mutation and the next: the call it makes, what it writes, what
 * the user is told, and the call that reverses it. The hook a component calls, the cache
 * invalidation behind it and the undo entry are derived from this and written nowhere else
 * (ADR 0028).
 */
export type MutationDeclaration<TVariables, TResult, TCaptured = void> = {
	/** the procedure this mutation calls. */
	mutate: (variables: TVariables) => Promise<TResult>;
	/**
	 * the workspace concepts this mutation writes to, directly or through the reconcile pass
	 * it triggers.
	 *
	 * Invalidation is coarse and stays coarse in this effort — every concept is invalidated
	 * whatever this names — so today the set is a statement rather than a switch. Narrowing
	 * invalidation onto it later has to reckon with rows that *display* another concept's
	 * data, which a write-set does not name.
	 */
	touches: readonly WorkspaceConcept[];
	/** what the user is told. A mutation that declares none reports nothing, either way. */
	toast?: MutationOptions['toast'];
	/**
	 * read what the inverse will need, before the mutation runs: the row an edit is about to
	 * overwrite, the row a deletion is about to remove. Whatever it resolves to reaches
	 * {@link inverse} untouched.
	 */
	capture?: (variables: TVariables) => Promise<TCaptured>;
	/**
	 * what this mutation leaves on the undo stack, given what it was called with and what came
	 * back. A mutation declaring none is outside undo, and nothing fails — the cost ADR 0026
	 * records and accepts.
	 *
	 * Declared beside {@link toast}, this is also what the announcement offers to take back:
	 * the offer is derived from the two and is not declared anywhere itself.
	 */
	inverse?: (change: {
		variables: TVariables;
		result: TResult;
		captured: TCaptured;
	}) => Inverse | undefined;
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
	records?: (change: {
		variables: TVariables;
		result: TResult;
		captured: TCaptured;
	}) => HistoryEntry | HistoryEntry[] | undefined;
};

function resolveToastMessage(message: ToastMessage) {
	return typeof message === 'function' ? message() : message;
}

function isToastMessage(message: boolean | ToastMessage | undefined): message is ToastErrorMessage {
	return typeof message === 'string' || typeof message === 'function';
}

/**
 * How long an announcement carrying an offer stays on screen.
 *
 * The shared duration suits a confirmation that only has to be read. One that also has to be
 * decided on, and reached for, does not fit in it.
 */
const OFFER_DURATION = 8000;

/** which way an offer would move the undo stack. */
type OfferDirection = 'undo' | 'redo';

/**
 * The offer to move a change back, carried by the announcement that change makes.
 *
 * It names the change rather than a position, because the stack moves whatever is on top and
 * an announcement outlives the moment it was raised in.
 */
export type UndoOffer = { client: QueryClient; change: Inverse; direction: OfferDirection };

/**
 * the announcement currently carrying an offer, where one is on screen.
 *
 * Only the change on top of the stack can be moved, so only one offer is ever live — and an
 * older announcement left standing would offer a control over somebody else's change.
 */
let outstandingOffer: string | number | null = null;

function withdrawOutstandingOffer() {
	if (outstandingOffer !== null) {
		toast.dismiss(outstandingOffer);
		outstandingOffer = null;
	}
}

// the stack is emptied whenever the workspace underneath it is replaced — a sync pull, a
// backup restore, a workspace switch. An offer still on screen then names a change nothing
// can move, so it leaves with the stack rather than waiting to be pressed and refuse.
inverseStack.observe(() => {
	if (!inverseStack.undoable && !inverseStack.redoable) {
		withdrawOutstandingOffer();
	}
});

function toToastAction({ client, change, direction }: UndoOffer) {
	const translations = get(LL);

	return {
		label: direction === 'undo' ? translations.common.undo.undo() : translations.common.undo.redo(),
		onClick: () => {
			// by identity: the stack is emptied whenever the workspace underneath it is replaced,
			// and an offer outliving that names a change nothing can move.
			const top = direction === 'undo' ? inverseStack.undoable : inverseStack.redoable;

			return top === change ? applyInverse(client, direction) : undefined;
		}
	};
}

export function onMutationSuccess(opts: MutationOptions, offer?: UndoOffer) {
	if (!opts.toast?.success) {
		return;
	}

	const message = resolveToastMessage(opts.toast.success);

	if (!offer) {
		toast.success(message);

		return;
	}

	withdrawOutstandingOffer();

	outstandingOffer = toast.success(message, {
		action: toToastAction(offer),
		duration: OFFER_DURATION
	});
}

export function onMutationError(opts: MutationOptions, e: Error) {
	const errorToast = opts.toast?.error;

	if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
		if (errorToast === true) {
			toast.error(e.message);
		} else if (isToastMessage(errorToast)) {
			toast.error(resolveToastMessage(errorToast));
		}
	} else {
		if (errorToast === true && e.message.trim()) {
			toast.error(e.message);
		} else if (isToastMessage(errorToast)) {
			toast.error(resolveToastMessage(errorToast));
		} else if (opts.toast?.unexpected) {
			toast.error(resolveToastMessage(opts.toast.unexpected));
		}
	}
}

/**
 * Move the undo stack one step, and announce what moved with the offer to move it back.
 *
 * The inverse issues an ordinary procedure, so the workspace has moved by the time it resolves
 * and the cache is as stale as it would be after any other mutation.
 */
async function applyInverse(client: QueryClient, direction: OfferDirection) {
	try {
		const applied = await (direction === 'undo' ? inverseStack.undo() : inverseStack.redo());

		if (!applied) {
			return;
		}

		await invalidateWorkspaceData(client);

		// an inverse issues its procedure directly rather than through a declared mutation, so
		// this is the only place that can record it. Without it the account shows a change and
		// stays silent about it being taken back.
		recordHistory(client, applied.records?.(direction));

		const translations = get(LL);
		const change = applied.describe(translations);

		onMutationSuccess(
			{
				toast: {
					success:
						direction === 'undo'
							? translations.common.undo.undone({ change })
							: translations.common.undo.redone({ change })
				}
			},
			// what a change offers next is its opposite: one taken back is one to apply again.
			{ client, change: applied, direction: direction === 'undo' ? 'redo' : 'undo' }
		);
	} catch (failure) {
		onMutationError(
			{ toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() } },
			failure as Error
		);
	}
}

/** take back the change on top of the undo stack. What the keyboard shortcut calls. */
export function applyUndo(client: QueryClient) {
	return applyInverse(client, 'undo');
}

/** apply the most recently taken-back change again. The mirror of {@link applyUndo}. */
export function applyRedo(client: QueryClient) {
	return applyInverse(client, 'redo');
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
		.then(() => client.invalidateQueries({ queryKey: historyKeys.all }))
		.catch((failure) => {
			recordDiagnosticError('history.append', {
				concept: entries[0].concept,
				recordId: entries.map((entry) => entry.recordId).join(','),
				detail: failure instanceof Error ? failure.message : String(failure)
			});
		});
}

/**
 * The invalidation is unconditional: a mutation that changed nothing costs one redundant local
 * refetch, where a mutation that changed something and skipped it shows the user a row that is
 * no longer there.
 */
function bindMutation<TVariables, TResult, TCaptured>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>,
	client: QueryClient
) {
	const opts: MutationOptions = { toast: declaration.toast };

	return {
		mutationFn: declaration.mutate,
		onMutate: declaration.capture,
		onSuccess: async (result: TResult, variables: TVariables, captured: TCaptured) => {
			await invalidateWorkspaceData(client);

			const inverse = declaration.inverse?.({ variables, result, captured });

			if (inverse) {
				inverseStack.record(inverse);
			}

			// appended after the work landed, and never awaited into it: the change is what the
			// reader asked for, and an account that could not be written is a smaller failure than
			// a change refused because its account could not be.
			const entry = declaration.records?.({ variables, result, captured });

			recordHistory(client, entry);

			onMutationSuccess(opts, inverse && { client, change: inverse, direction: 'undo' });
		},
		onError: (e: Error) => onMutationError(opts, e)
	};
}

/**
 * Turn a declaration into the hook a component calls.
 *
 * This is what a concept's query module exports for each of its mutations. Adding a data
 * mutation means writing one declaration — the call, what it touches, what the user is told,
 * and how it is taken back — and nothing about the cache or the undo stack is written by hand.
 */
export function declareMutation<TVariables, TResult, TCaptured = void>(
	declaration: MutationDeclaration<TVariables, TResult, TCaptured>
) {
	return () => {
		const client = useQueryClient();

		return createMutation(() => bindMutation(declaration, client));
	};
}
