import type { RouteId } from '$app/types';
import type { RecordKind } from '$lib/permission';
import type { Transfer } from '$lib/transfer';
import type { AnyRouter } from '@trpc/server';

/**
 * THE FEATURE CONTRACT
 *
 * what a feature, or a capability with a router, declares about itself in its own `feature.ts`,
 * and what the composition root in `$lib/app` reads off the list of them. It loads under Node,
 * so a declaration never imports a component.
 *
 * **The declaration's type is kept, not widened.** `defineFeature` infers the name, the router
 * and the prefix as the declared ones, so {@link routersOf} can hand `router()` a record whose
 * every key and procedure is the declared one, and the typed client inferred from `appRouter` is
 * the one a hand-written record would give.
 */
export type Feature<N extends string = string, R extends AnyRouter = AnyRouter> = {
	/** the key its router is mounted at */
	name: N;
	/**
	 * its router. A sub-concept whose procedures its parent's router serves declares none, and is
	 * mounted nowhere: the unit is the one today, served under `complex.units`.
	 */
	router?: R;
	/** the record kind it holds, on a feature that holds one */
	kind?: RecordKind;
	/**
	 * its workspace query-cache prefix: the segments every one of its query keys starts with, and
	 * what the workspace invalidation names. Its last segment names the concept a mutation says it
	 * touches.
	 */
	prefix?: readonly string[];
	/** the pages it holds, which the shell's navigation reads */
	pages?: readonly Page[];
	/**
	 * the sheets it hands a workspace file, on a feature that holds records: what each tab is
	 * called, its columns, its turn, and how its rows are read and its records written. Read by
	 * `$lib/transfer`, which the composition root hands the list.
	 */
	transfer?: Transfer;
};

/**
 * One page a feature holds, by its route id, and what the shell's navigation needs to know of it:
 * whether the trail names it, the kind of record it lists, and the record page it is reached
 * through. These are the facts navigation reads under Node, so they live here; what the page is
 * called and the icon it wears are the window's, and the feature's `surface.ts` declares them.
 */
export type Page = {
	route: RouteId;
	/** whether it is a place the trail names, a page a crumb can link to */
	trail?: boolean;
	/** the kind of record it lists, where it lists one; a reader who may not view it is not offered it */
	lists?: RecordKind;
	/** the record page it is reached through, where it has one */
	parent?: RouteId;
};

/** Declare a feature, keeping every field as it was declared. */
export const defineFeature = <const F extends Feature>(feature: F): F => feature;

/** The listed features that carry a router of their own. */
type Routed<F extends readonly Feature[]> = Extract<F[number], { router: AnyRouter }>;

/** The record `router()` takes, one key per feature with a router, typed from the list. */
export type RoutersOf<F extends readonly Feature[]> = {
	[K in Routed<F> as K['name']]: K['router'];
};

/** Every feature's router under its name, for the root router to mount. */
export function routersOf<const F extends readonly Feature[]>(features: F): RoutersOf<F> {
	return Object.fromEntries(
		features.flatMap((feature) => (feature.router ? [[feature.name, feature.router]] : []))
	) as RoutersOf<F>;
}
