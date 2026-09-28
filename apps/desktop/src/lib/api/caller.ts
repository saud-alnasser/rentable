import type { Host } from '$lib/app/host';
import type { AppRouter } from '$lib/app/router';
import type { Context } from './context';
import { caller, context } from './trpc';

/**
 * THE CALLER
 *
 * every procedure in the application, bound to the context they run under.
 *
 * **The context is built on first use rather than at module load, and that is the whole change
 * here.** It used to be `caller(appRouter)(await context())` — a top-level `await` that ran while
 * `$lib/api/caller` was being imported, which is before anything has rendered and long before
 * anybody has signed in. That was free while a context could always be produced. It stops being
 * free the moment one cannot: a context that refuses for want of an account would not fail a
 * request, it would fail the *import* of this module, and every surface in the application imports
 * it. The application would not boot on a clean install, which is the state every user starts in.
 *
 * tRPC takes a factory for exactly this, so nothing about the 29 modules importing the default
 * export changes — they still hold procedures and still call them the same way.
 *
 * **Built once and kept, not rebuilt per call.** Building one reaches the shell for the state it
 * reads identity off, and doing that on every procedure call would put an IPC round trip in front
 * of every read in the application. What replaces the freshness that would buy is
 * {@link forgetContext}: the thing the context is derived from changes at somebody signing in,
 * somebody signing out, an owner creating the organization on the first run, which signs them in
 * without passing the wall, a workspace being opened, whose grant decides what may be written in
 * it, and every sync heartbeat, which is what brings a role or an override changed on another
 * machine (effort 838, requirement 8).
 */
let held: Promise<Context> | null = null;

/**
 * the context this process is running under, built over `host` the first time something asks for
 * it.
 *
 * The promise is held rather than the value, so two calls racing the first build share it instead
 * of each starting one.
 */
const heldContext = (host: Host) => (held ??= context({ host }));

/**
 * Forget the context, so the next call builds one under whoever is signed in now.
 *
 * **Called by the sign-in wall, by signing out, by the first run's create, by opening a workspace
 * and by every heartbeat**, and it has to be: `context()` resolves the
 * acting identity when it runs, so a context built before the consent screen belongs to nobody and
 * would go on belonging to nobody for the life of the process. Signing out is the same fact in
 * reverse, and leaving a stale one behind there is the worse of the two — it is an identity the
 * machine no longer holds.
 */
export function forgetContext() {
	held = null;
}

/** Every procedure in the application, as the caller the composition root binds hands them over. */
export type Api = ReturnType<ReturnType<typeof caller<AppRouter['_def']['record']>>>;

/** What the composition root binds: the caller factory of the root router. */
type CallerFactory = (context: () => Promise<Context>) => Api;

/**
 * **The router is bound in, never imported.** Every procedure is a feature's, and this home sits
 * below the features, so importing the root router here would have the wiring depend on every
 * feature it wires. `$lib/app/caller` binds the root router's caller factory once, as the root
 * layout loads and before anything has rendered; this module knows the router only by its type.
 */
let bound: Api | null = null;

/**
 * Bind the root router's caller, and the host its context is built over. Called once, by
 * `$lib/app/caller`. The host is composed from the features' ports, so it is bound in for the
 * reason the router is, and known here by its type alone.
 */
export function bindCaller(factory: CallerFactory, host: Host) {
	bound = factory(() => heldContext(host));
}

function boundCaller(): Api {
	if (bound === null) {
		throw new Error(
			'a procedure was called before the root router was bound: import `$lib/app/caller` first'
		);
	}

	return bound;
}

export default new Proxy({} as Api, {
	get: (_, key) => Reflect.get(boundCaller(), key)
});
