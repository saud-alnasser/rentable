import type { RecordKind } from '$lib/permission';
import type { AnyRouter } from '@trpc/server';

/**
 * THE FEATURE CONTRACT
 *
 * what a feature, or a capability with a router, declares about itself in its own `feature.ts`,
 * and what the composition root in `$lib/app` reads off the list of them. It loads under Node,
 * so a declaration never imports a component.
 *
 * **The router's type is kept, not widened.** `defineFeature` infers the name as a literal and the
 * router as its own type, so {@link routersOf} can hand `router()` a record whose every key and
 * procedure is the declared one, and the typed client inferred from `appRouter` is the one a
 * hand-written record would give.
 */
export type Feature<N extends string = string, R extends AnyRouter = AnyRouter> = {
	/** the key its router is mounted at */
	name: N;
	router: R;
	/** the record kind it holds, on a feature that holds one */
	kind?: RecordKind;
	/** its workspace query-cache prefix */
	prefix?: string;
};

/** Declare a feature, keeping its name as a literal and its router as its own type. */
export const defineFeature = <const N extends string, R extends AnyRouter>(
	feature: Feature<N, R>
) => feature;

/** The record `router()` takes, one key per feature, typed from the list. */
export type RoutersOf<F extends readonly Feature[]> = {
	[K in F[number] as K['name']]: K['router'];
};

/** Every feature's router under its name, for the root router to mount. */
export function routersOf<const F extends readonly Feature[]>(features: F): RoutersOf<F> {
	return Object.fromEntries(
		features.map((feature) => [feature.name, feature.router])
	) as RoutersOf<F>;
}
