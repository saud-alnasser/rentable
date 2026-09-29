// Shared scaffolding for the tests that drive a declared mutation. Not a `*.test.ts` file, so
// the test runner does not pick it up directly.
//
// The runner's rather than a module's: `node:test` cannot load the query library, which reaches a
// `.svelte` file, so every test that drives a mutation substitutes it, and the tests of seven
// modules read what the substitute was handed through this. A test reaches it as
// `#tests/mutation.ts`. *It was `design/tests/testing.ts` until ticket 42 of effort 840, from
// when mutations were declared in `design/`.*

import assert from 'node:assert/strict';

import type { CreateMutationResult } from '@tanstack/svelte-query';

/**
 * What `declareMutation` hands the query library: the call, what to read before it, what to do
 * after it, and what to do when it fails.
 *
 * The library reaches a `.svelte` file, so every test that drives a mutation substitutes it,
 * and the substitute answers a hook with the very object it was handed. That is why a hook
 * returns this here and not the `CreateMutationResult` its declared type names — a result the
 * real library builds and this harness never has.
 */
export type MutationBinding<TVariables, TResult, TCaptured> = {
	mutationFn: (variables: TVariables) => Promise<TResult>;
	onMutate?: (variables: TVariables) => Promise<TCaptured> | TCaptured;
	onSuccess: (
		result: TResult,
		variables: TVariables,
		captured: TCaptured | undefined
	) => Promise<void>;
	/** answers with a promise only where the declaration's `failed` does, and is awaited then. */
	onError: (error: Error, variables?: TVariables, captured?: TCaptured) => void | Promise<void>;
	/** what runs after success and refusal alike; only a mutation that declares one has it. */
	onSettled?: () => Promise<void>;
};

function isMutationBinding<TVariables, TResult, TCaptured>(
	value: unknown
): value is MutationBinding<TVariables, TResult, TCaptured> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'mutationFn' in value &&
		typeof value.mutationFn === 'function' &&
		'onSuccess' in value &&
		typeof value.onSuccess === 'function' &&
		'onError' in value &&
		typeof value.onError === 'function'
	);
}

/**
 * Call a mutation hook and answer with the binding the substituted library was handed.
 *
 * The shape is checked rather than asserted — a substitute that stopped passing the binding
 * through would fail here by name instead of failing later as a missing method. Which variables
 * and which result are read off the hook's own type, which the declaration behind it makes
 * concrete, so what a test drives is still typed by the procedure it declared.
 */
export function bindingOf<TVariables, TResult, TCaptured>(
	hook: () => CreateMutationResult<TResult, Error, TVariables, TCaptured>
): MutationBinding<TVariables, TResult, TCaptured> {
	const bound: unknown = hook();

	assert.ok(
		isMutationBinding<TVariables, TResult, TCaptured>(bound),
		'the substituted query library did not answer the hook with its binding'
	);

	return bound;
}
