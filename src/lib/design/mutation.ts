import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import { inverseStack, type Inverse } from '$lib/design/inverse';
import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { TRPCError } from '@trpc/server';
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
	 */
	inverse?: (change: {
		variables: TVariables;
		result: TResult;
		captured: TCaptured;
	}) => Inverse | undefined;
};

function resolveToastMessage(message: ToastMessage) {
	return typeof message === 'function' ? message() : message;
}

function isToastMessage(message: boolean | ToastMessage | undefined): message is ToastErrorMessage {
	return typeof message === 'string' || typeof message === 'function';
}

export function onMutationSuccess(opts: MutationOptions) {
	if (opts.toast?.success) {
		toast.success(resolveToastMessage(opts.toast.success));
	}
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

			onMutationSuccess(opts);
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
