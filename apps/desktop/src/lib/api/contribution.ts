import type { Contributions } from '$lib/app/contributions';

/**
 * THE CONTRIBUTIONS A PROCEDURE READS
 *
 * what every feature contributes to the kinds it depends on, merged by the composition root, and
 * handed to each procedure as `ctx.contributions` by the middleware every procedure in `./trpc`
 * starts with. `$lib/feature/feature` says what a contribution is.
 *
 * **Bound in, never imported**, for the reason the root router is in `./caller`: the features
 * contribute, and this home sits below them. `$lib/app/router` binds the merged value as the root
 * router is built, so whatever builds a caller over that router, the application or a test, has
 * it bound.
 *
 * **Beside the context rather than in it.** `context()` builds the four ambient members a request
 * runs under, what crosses the process boundary or is nondeterministic; a contribution is neither,
 * but the same composition for every request, so the middleware adds it where a procedure reads it
 * and the context stays what it is.
 */
let bound: Contributions | null = null;

/** Bind what the features contribute, merged. Called once, by `$lib/app/router`. */
export function bindContributions(contributions: Contributions) {
	bound = contributions;
}

function boundContributions(): Contributions {
	if (bound === null) {
		throw new Error('a contribution was read before it was bound: import `$lib/app/router` first');
	}

	return bound;
}

/**
 * What the features contribute, as the middleware hands it to a procedure.
 *
 * **Each kind is looked up as it is read**, the way `./caller` hands out the bound caller, so a
 * procedure that reads no contribution runs over a router built without the root one, as a test's
 * own router is, and one that reads a contribution before anything was bound says so.
 */
export const contributions = new Proxy({} as Contributions, {
	get: (_, kind) => Reflect.get(boundContributions(), kind)
});

/**
 * What a procedure's context carries beside the four ambient members: the contributions, of which
 * a feature reads its own kind's. A domain helper a procedure hands its context to takes this.
 */
export type Contributed = { contributions: Contributions };
