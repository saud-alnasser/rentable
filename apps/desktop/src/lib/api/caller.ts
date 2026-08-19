import type { Context } from './context';
import { appRouter } from './router';
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
 * {@link forgetContext}: the thing the context is derived from changes at exactly two moments, and
 * both of them are somebody signing in or out.
 */
let held: Promise<Context> | null = null;

/**
 * the context this process is running under, built the first time something asks for it.
 *
 * The promise is held rather than the value, so two calls racing the first build share it instead
 * of each starting one.
 */
const heldContext = () => (held ??= context());

/**
 * Forget the context, so the next call builds one under whoever is signed in now.
 *
 * **Called by the sign-in wall and by signing out**, and it has to be: `context()` resolves the
 * acting identity when it runs, so a context built before the consent screen belongs to nobody and
 * would go on belonging to nobody for the life of the process. Signing out is the same fact in
 * reverse, and leaving a stale one behind there is the worse of the two — it is an identity the
 * machine no longer holds.
 */
export function forgetContext() {
	held = null;
}

export default caller(appRouter)(heldContext);
