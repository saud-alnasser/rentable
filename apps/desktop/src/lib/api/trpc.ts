import { requestWorkspaceSync } from '$lib/sync/event';
import { permits, type Administration } from '@rentable/workspace-permission';
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
 *
 * **`requirePermission` is the one entry that is called rather than used.** It is a factory,
 * because what it refuses depends on which acts the procedure asked for; everything else here is
 * a middleware and goes straight into a `.use()`.
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
	/**
	 * refuses a call by somebody whose membership does not carry every act it names.
	 *
	 * **A factory rather than a middleware, and the only entry here that is called** — what it
	 * refuses depends on which acts a procedure asked for, and those are known where the procedure
	 * is declared rather than here.
	 *
	 * **Every act, not any of them.** A procedure that names two is a procedure that does two
	 * things, and a caller holding one of them cannot do it.
	 *
	 * **`FORBIDDEN`, which surfaces as a generic failure** ([[rules/api-layer]], under *Errors*,
	 * makes anything that is not `BAD_REQUEST` do that). That is the right outcome rather than a
	 * shortfall: a caller who reached a procedure the interface would not have drawn for them has
	 * gone around the interface, and there is no sentence worth writing for that. It matches
	 * `requireIdentity`'s `UNAUTHORIZED` one middleware up.
	 *
	 * **It re-checks the identity it is composed behind**, because it is built off the root `t` and
	 * so cannot see the narrowing `requireIdentity` did. The check is cheap and the alternative is
	 * a non-null assertion standing where the whole point is that nobody is asserted to be here.
	 *
	 * **This is the second opinion and never the one that decides.** The control plane refuses the
	 * same request whatever this says, and a client is a thing a person can edit — requirement 6.
	 */
	requirePermission: (...acts: readonly Administration[]) =>
		t.middleware(async ({ ctx, next }) => {
			const identity = ctx.identity;

			if (!identity || !acts.every((act) => permits(identity.permissions, act))) {
				// The acts by their own names rather than a sentence built around them: this never
				// reaches a person — `FORBIDDEN` surfaces as a generic failure — so it is written
				// for whoever is reading a log, and *may not renameWorkspace* is prose neither
				// audience wants.
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: `this account does not hold ${acts.join(', ')} in this workspace`
				});
			}

			return next({ ctx: { identity } });
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
 *
 * **`permitted` is a third way of writing the first**, added 2026-08-21. It is not a fourth kind of
 * caller: it composes onto `member` rather than replacing it, so a permitted procedure is a member
 * procedure that asks one more question, and everything `requireIdentity` narrows downstream
 * survives. `public` is untouched and out of reach of this — reading what this machine has synced
 * is a fact about the machine, and asking what an account may do is the opposite question.
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
	public: t.procedure.use(middleware.log),
	/**
	 * permitted
	 *
	 * a call by somebody the workspace permits to do the named acts, refused where it does not.
	 *
	 * **A surface that hides a control is a courtesy; this is what makes hiding it honest.** The
	 * gate on the interface and this refusal answer the same question from the same number, and
	 * neither is the authority — the control plane is, and it checks again.
	 *
	 * **The acts are named, never a number, a bit index or a role.**
	 * `@rentable/workspace-permission` is where the names live and it is the same module the
	 * control plane reads them from, so there is no second mapping to drift.
	 *
	 * middlewares: [log, requireIdentity, requirePermission(...acts)]
	 */
	permitted: (...acts: readonly Administration[]) =>
		t.procedure
			.use(middleware.log)
			.use(middleware.requireIdentity)
			.use(middleware.requirePermission(...acts))
};
