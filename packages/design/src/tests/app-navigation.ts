/**
 * What `$app/navigation` resolves to under `vitest run`, and the only thing that supplies it here.
 *
 * **The package imports `$app/*` and that is settled** — `back.svelte.ts` and
 * `block/record-surface.svelte` both call `goto`. What was never settled is what those specifiers
 * resolve to under a test: `svelte.config.js` declares no alias on purpose, because an alias in a
 * library reaches the consumer unrewritten, and `vitest.config.js` declared none either. So a test
 * that touched either module failed before it reached an assertion, with
 * `Failed to resolve import "$app/navigation"`.
 *
 * **The alias is the runner's rather than the package's**, and that is the whole of why this file
 * sits here. `vitest.config.js` points `$app/navigation` at it; nothing else does, and no build
 * step or consumer sees either. It is under `src/tests/` for the reason every fixture is: the
 * `exports` map covers `src/lib/` alone, so a stub written one directory over would be
 * `@rentable/design/tests/app-navigation.js` to everybody who installs the package.
 *
 * It records rather than only resolving, because the one navigation in the package that a test
 * would want to watch is an effect: `record-surface` writes the chosen collection into the address
 * without a reader doing anything.
 */

/** one call, as the caller made it. */
export type Navigation = {
	url: string;
	options?: Record<string, unknown>;
};

const calls: Navigation[] = [];

/** what {@link goto} has been asked to do since the last {@link forgetNavigations}. */
export function navigations(): readonly Navigation[] {
	return calls;
}

/** call in a `beforeEach`, or one file's navigations are read by the next test in it. */
export function forgetNavigations(): void {
	calls.length = 0;
}

export function goto(url: string, options?: Record<string, unknown>): Promise<void> {
	calls.push({ url, options });

	return Promise.resolve();
}
