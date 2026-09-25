import { requestWorkspaceSync } from '$lib/sync/event';
import {
	ADMINISTRATION,
	EVERY_FLAG,
	FAMILIES,
	FLAGS,
	permits,
	type Administration,
	type Flag,
	type Named
} from '@rentable/workspace-permission';
import { TRPCError, initTRPC } from '@trpc/server';
import { ZodError, type z } from 'zod';
import { context, type Identity } from './context';
import { readRefusal } from './refusal';

/**
 * CONTEXT
 *
 * the context available to every procedure in the API. it is built by `context.ts`,
 * which supplies its dependencies; re-exported here so callers importing from `./trpc`
 * are unchanged.
 */
export { context };

/**
 * The flags that are the organization's rather than a workspace's: its administration and the
 * owner's acts. A read-only grant clears none of them, so a refusal naming one is not about the
 * workspace open.
 */
const ORGANIZATION_FLAGS: readonly Flag[] = [...FAMILIES.administration, ...FAMILIES.owner];

/** a name as the flag it is: one of today's aliases read as the flag on its bit. */
function flagOf(name: Named): Flag {
	if (name in FLAGS) {
		return name as Flag;
	}

	const bit = ADMINISTRATION[name as Administration];

	return EVERY_FLAG.find((flag) => FLAGS[flag] === bit) as Flag;
}

/**
 * the flags a refusal names, and where: *in this workspace* only where every one of them is a
 * record flag, since those are what a workspace's grant narrows. An organization flag is held
 * across the organization or not at all, and saying *in this workspace* of one sends whoever reads
 * the log to the wrong place.
 */
function refused(names: readonly Named[]): string {
	const flags = [...new Set(names.map(flagOf))];
	const where = flags.some((flag) => ORGANIZATION_FLAGS.includes(flag)) ? '' : ' in this workspace';

	return `${flags.join(', ')}${where}`;
}

/**
 * refuses somebody who does not hold every one of `acts`, naming the ones they lack.
 *
 * The flags by their own names rather than a sentence built around them: this never reaches a
 * person, since `FORBIDDEN` reads as its own translated sentence, so it is written for whoever is
 * reading a log, and *may not renameWorkspace* is prose neither audience wants. Only the ones
 * missing, which is what the reader needs.
 */
function refuseMissing(
	identity: Identity | null,
	acts: readonly Named[]
): asserts identity is Identity {
	const missing = acts.filter((act) => !identity || !permits(identity.permissions, act));

	if (!identity || missing.length > 0) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: `this account does not hold ${refused(missing)}`
		});
	}
}

/**
 * One flag at least.
 *
 * A gate naming nothing opens for everybody, since `every` over an empty list is `true`, so an
 * empty gate is a compile error at the place it would be written. `Acts` also takes today's
 * aliases, which ticket 11 of effort 838 retires; what a procedure records is the flag either way.
 */
export type Flags = readonly [Flag, ...Flag[]];
type Acts = readonly [Named, ...Named[]];

/**
 * What a procedure says about who may call it, read by the test that walks the router (effort 838,
 * criterion 1). Each way of declaring a procedure below records its own entry, so a procedure
 * declared any other way records nothing and that test names it.
 */
export type Meta = {
	/** every flag the caller must hold: `procedure.permitted`'s. */
	flags?: readonly Flag[];
	/** the flags one of which is enough: `procedure.permittedAny`'s. */
	anyOf?: readonly Flag[];
	/** the flags the call may ask for, which of them read off its input: `procedure.permittedBy`'s. */
	byInput?: Flags;
	/** a member's own act, or one open to every member: `procedure.member`'s. */
	member?: true;
	/** a call with nobody to name: `procedure.public`'s. */
	public?: true;
};

/**
 * INITIALIZER
 *
 * it holds everything related to trpc api with the configurations.
 */
const t = initTRPC
	.context<typeof context>()
	.meta<Meta>()
	.create({
		allowOutsideOfServer: true,
		errorFormatter({ shape, error }) {
			return {
				...shape,
				data: {
					...shape.data,
					zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
					// the code and values a refusal was raised with, which is what the interface reads
					// rather than the message ([[rules/api-layer]], under *Errors*).
					refusal: readRefusal(error)
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
	 * **`FORBIDDEN`, which reads as one fixed sentence** ([[rules/api-layer]], under *Errors*),
	 * the reader's words for a role that does not allow the act, never this message. A caller who
	 * reached a procedure the interface would not have drawn for them has gone around the
	 * interface, so no sentence names the acts. It matches `requireIdentity`'s `UNAUTHORIZED` one
	 * middleware up.
	 *
	 * **It re-checks the identity it is composed behind**, because it is built off the root `t` and
	 * so cannot see the narrowing `requireIdentity` did. The check is cheap and the alternative is
	 * a non-null assertion standing where the whole point is that nobody is asserted to be here.
	 *
	 * **This is the second opinion and never the one that decides.** The Rust side refuses the
	 * same request against the member's signed row whatever this says, and a client is a thing a
	 * person can edit (requirement 6).
	 *
	 * **It takes any flag, a record flag included**, and its refusal says *in this workspace* only
	 * of those (effort 838, requirement 10): the identity it reads holds the permissions of the
	 * workspace open, with a read-only grant's writes already cleared.
	 */
	requirePermission: (...acts: Acts) =>
		t.middleware(async ({ ctx, next }) => {
			const identity = ctx.identity;

			refuseMissing(identity, acts);

			return next({ ctx: { identity } });
		}),
	/**
	 * refuses a call by somebody whose membership carries none of the acts it names.
	 *
	 * **Any of them, where `requirePermission` above wants every one.** A procedure asks for this
	 * where two acts each carry the same authority over the same thing rather than where one
	 * procedure does two things: making a link is `inviteMember`'s or `resetPassword`'s, because
	 * whoever may take an account's password away may hand back the link that restores it.
	 *
	 * Everything else about it is `requirePermission`'s, including that it is the second opinion
	 * and never the one that decides: `permission::require_any` refuses the same request against
	 * the member's signed row.
	 */
	requireAnyPermission: (...acts: Acts) =>
		t.middleware(async ({ ctx, next }) => {
			const identity = ctx.identity;

			if (!identity || !acts.some((act) => permits(identity.permissions, act))) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: `this account holds none of ${refused(acts)}`
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
 *
 * **Every record procedure is `permitted` since effort 838**, each naming the flag its act needs
 * (requirement 10), and `member` alone is left to what is a member's own or open to every member.
 * Each way of declaring a procedure records itself in its `meta`, which is what lets a test walk
 * the router and name a procedure that says nothing about who may call it.
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
	 * On its own it is for a member's own act, or a read open to every member whose answer leaves
	 * out what they may not view. A record act is `permitted`, which asks this first.
	 *
	 * middlewares: [log, requireIdentity]
	 */
	member: t.procedure.meta({ member: true }).use(middleware.log).use(middleware.requireIdentity),
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
	public: t.procedure.meta({ public: true }).use(middleware.log),
	/**
	 * permitted
	 *
	 * a call by somebody the workspace permits to do the named acts, refused where it does not.
	 *
	 * **A surface that hides a control is a courtesy; this is what makes hiding it honest.** The
	 * gate on the interface and this refusal answer the same question from the same number, and
	 * neither is the authority; the signed row in Rust is, and it checks again.
	 *
	 * **The acts are named, never a number, a bit index or a role.**
	 * `@rentable/workspace-permission` is where the names live and `permission.rs` carries the
	 * same bits under the same names, and a test on each side keeps the two from drifting.
	 *
	 * **A bulk procedure names the flag of the single act**, and so does an undo's inverse: deleting
	 * a selection is deleting, and restoring what was deleted is an edit of it (requirement 1).
	 *
	 * middlewares: [log, requireIdentity, requirePermission(...acts)]
	 */
	permitted: (...acts: Acts) =>
		t.procedure
			.meta({ flags: acts.map(flagOf) })
			.use(middleware.log)
			.use(middleware.requireIdentity)
			.use(middleware.requirePermission(...acts)),
	/**
	 * permittedAny
	 *
	 * a call by somebody the workspace permits to do **any one** of the named acts.
	 *
	 * **It is the exception and `permitted` is the rule**, deliberately in that order: a procedure
	 * gated on two acts is ordinarily a procedure that does two things, and the holder of one
	 * cannot do it. This is for the other case, where two acts carry the same authority over the
	 * same thing and either is enough, which is one procedure: `member.linkMake`.
	 *
	 * middlewares: [log, requireIdentity, requireAnyPermission(...acts)]
	 */
	permittedAny: (...acts: Acts) =>
		t.procedure
			.meta({ anyOf: acts.map(flagOf) })
			.use(middleware.log)
			.use(middleware.requireIdentity)
			.use(middleware.requireAnyPermission(...acts)),
	/**
	 * permittedBy
	 *
	 * a call whose flag depends on what it is about, refused where the caller does not hold the one
	 * its input asks for.
	 *
	 * **For a procedure that serves every record kind**, which is the history: appending an entry
	 * about a payment is the payment's act and one about a tenant is the tenant's, so no one flag
	 * could be named where the procedure is declared. `possible` is every flag it may ask for,
	 * recorded where the walk reads it; `flagsOf` is which of them this input asks for.
	 *
	 * The input is read before the permission, unlike `permitted`, because the permission is read
	 * off it; a malformed call is refused as malformed either way.
	 *
	 * middlewares: [log, requireIdentity, input, flagsOf(input)]
	 */
	permittedBy: <Schema extends z.ZodType>(
		possible: Flags,
		schema: Schema,
		flagsOf: (input: z.output<Schema>) => readonly Flag[]
	) =>
		t.procedure
			.meta({ byInput: possible })
			.use(middleware.log)
			.use(middleware.requireIdentity)
			.input(schema)
			.use(async ({ ctx, input, next }) => {
				refuseMissing(ctx.identity, flagsOf(input as z.output<Schema>));

				return next();
			})
};
