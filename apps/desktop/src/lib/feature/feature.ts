import type { RouteId } from '$app/types';
import type { Contributions } from '$lib/app/contributions';
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
	/**
	 * what it contributes to the kinds it depends on, keyed by the kind each serves: what a
	 * feature it depends on reads of it without importing it. Its router reads its own kind's
	 * through `ctx.contributions`; see {@link Contributing}.
	 */
	contributes?: Contributing;
};

/**
 * WHAT A FEATURE CONTRIBUTES
 *
 * **Record features depend one way**: the contract on the tenant and the unit, the payment on the
 * contract (effort 840, plan, *A feature's reverse needs are contributions*). Where the
 * depended-on feature needs something of the one depending on it, a tenant with contracts that
 * may not be deleted or a contract's settlement reading its payments, it does not import it. It
 * declares what it needs as a type in its own domain module, the depending feature declares the
 * value under `contributes` in its `feature.ts`, keyed by the kind it serves, and the composition
 * root merges every feature's into one object per kind (`$lib/app/contributions`).
 *
 * **Several features may each contribute part of one kind's need**, and a member contributed
 * twice is refused when the list is composed. A member nobody contributes is a type error there,
 * since the merged value is assigned to the declared {@link Contributions}.
 *
 * **Read at call time, never at import.** A router reads `ctx.contributions.<its kind>` inside a
 * procedure, where `$lib/api/trpc` has put the composed value; nothing holds a contribution in a
 * module-level constant, so the order the modules evaluate in never decides what a feature sees.
 * The window has the same hand-over for what a page, a host or an act needs: a `surface.ts`
 * declares it, and it is read through `contributionsTo` in `./surface`.
 *
 * **A declaration file is the one place a feature names another's kind**, which is what it is
 * contributing to; `lib/tests/layers.test.ts` holds every other module to naming only its own.
 */
export type Contributing = { [K in keyof Contributions]?: Partial<Contributions[K]> };

/** Every member of a union, as one type holding them all. */
type Intersected<U> = (U extends unknown ? (member: U) => void : never) extends (
	member: infer I
) => void
	? I
	: never;

/**
 * What a list of declarations contributes, merged: every declaration's `contributes`, one object
 * per kind holding each member any of them contributes to it. Typed from the list, so assigning it
 * to the declared map is what finds a member nobody contributes.
 */
export type ContributionsOf<D extends readonly object[]> = Intersected<
	D[number] extends infer Each ? (Each extends { contributes: infer C } ? C : never) : never
>;

/**
 * Every declaration's contributions merged into one object per kind, for the composition root to
 * hand over. Refuses a member two declarations both contribute: one of them would silently win.
 */
export function contributionsOf<const D extends readonly object[]>(
	declarations: D
): ContributionsOf<D> {
	const merged: Record<string, Record<string, unknown>> = {};

	for (const declaration of declarations) {
		const { contributes } = declaration as { contributes?: object };

		for (const [kind, members] of Object.entries(contributes ?? {})) {
			const served = (merged[kind] ??= {});

			for (const [name, member] of Object.entries(members as Record<string, unknown>)) {
				if (name in served) {
					throw new Error(`${kind}.${name} is contributed twice`);
				}

				served[name] = member;
			}
		}
	}

	return merged as ContributionsOf<D>;
}

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
