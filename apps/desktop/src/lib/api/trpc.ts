import { requestWorkspaceSync } from '$lib/sync/event';
import { TRPCError, initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { context } from './context';

/**
 * CONTEXT
 *
 * the context available to every procedure in the API. it is built by `context.ts`,
 * which supplies its dependencies; re-exported here so callers importing from `./trpc`
 * are unchanged.
 */
export { context };

/**
 * INITIALIZER
 *
 * it holds everything related to trpc api with the configurations.
 */
const t = initTRPC.context<typeof context>().create({
	allowOutsideOfServer: true,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null
			}
		};
	}
});

/**
 * ROUTES
 *
 * this section defines the router that contains routes that are available to the API.
 */
export const router = t.router;

/**
 * CALLER
 *
 * this section defines the caller that calls procedures in the API.
 */
export const caller = t.createCallerFactory;

/**
 * MIDDLEWARES that can be used in the API procedures.
 *
 * this object holds the defined middlewares that are available to the API procedures.
 * some of them are used by default in the procedures.
 */
export const middleware = {
	/**
	 * logs the request and the duration it took to fulfill it.
	 */
	log: t.middleware(async ({ ctx, path, next }) => {
		const start = ctx.clock.now();
		const result = await next();
		const end = ctx.clock.now();

		const duration = end - start;

		console.log(`[TRPC] ${path} executed in ${duration}ms`);

		return result;
	}),
	/**
	 * refuses a call that needs an acting user on a machine where nobody is signed in.
	 *
	 * **The refusal used to be `context()`'s, and it moved here on 2026-08-20.** Building a context
	 * was where it lived while a sign-in stood in front of the whole application; requirement 7 of
	 * [[efforts/capabilities-only-one-surface-got]] draws the shell before that, and the account row
	 * on it offers a settings page that is host-only from end to end. A context that refused would
	 * have refused that page too, for want of something it never asked for.
	 *
	 * **Whether a call needs an actor is a property of the call**, which is why the check belongs to
	 * a procedure rather than to the thing a procedure runs under.
	 *
	 * It narrows as well as refuses: everything downstream of this reads `ctx.identity` as an
	 * `Identity` rather than as one-or-nothing.
	 */
	requireIdentity: t.middleware(async ({ ctx, next }) => {
		if (!ctx.identity) {
			throw new TRPCError({
				code: 'UNAUTHORIZED',
				message: 'no account is signed in on this machine'
			});
		}

		return next({ ctx: { identity: ctx.identity } });
	}),
	scheduleWorkspaceSync: t.middleware(async ({ next }) => {
		const result = await next();

		if (result.ok) {
			requestWorkspaceSync();
		}

		return result;
	})
};

export const autosync = () => middleware.scheduleWorkspaceSync;

/**
 * PROCEDURES
 *
 * this section defines the procedures that are available to the API.
 */
/**
 * PROCEDURES
 *
 * **Two kinds, and the difference is whether the call has an acting user to name.**
 *
 * *There was one until 2026-08-20, called `public`, and it was every procedure in the application
 * — which was harmless while `context()` refused a machine with nobody signed in, and stopped
 * being harmless the moment it could not.* Requirement 7 of
 * [[efforts/capabilities-only-one-surface-got]] draws the shell signed out, so the absence has to
 * be expressible, and something has to hold the line the context used to hold.
 *
 * **`member` is the default and `public` is the exception**, deliberately in that order: a
 * procedure written without thinking about this should be the safe one. Forty-six of the fifty-one
 * are `member`.
 */
export const procedure = {
	/**
	 * member
	 *
	 * a call by somebody, refused where there is nobody. **Everything that reaches the workspace
	 * database is one of these**, which is what keeps requirement 3's ordering — nothing opens or
	 * writes the workspace before there is an account — a property of the boundary rather than of
	 * the order the layout happens to call things in.
	 *
	 * middlewares: [log, requireIdentity]
	 */
	member: t.procedure.use(middleware.log).use(middleware.requireIdentity),
	/**
	 * public
	 *
	 * a call with no actor to name, and **host-only is the test rather than harmless-looking**.
	 * These reach `ctx.host` and never `ctx.db`: this machine's own settings, its updater, and
	 * what the shell knows about syncing. A procedure that touches the workspace is not public
	 * however read-only it looks, because the workspace belongs to somebody.
	 *
	 * middlewares: [log]
	 */
	public: t.procedure.use(middleware.log)
};
