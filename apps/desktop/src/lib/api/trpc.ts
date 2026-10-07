import { FAMILIES, permits, WRITE_FLAGS, type Flag } from '@rentable/workspace-permission';
import { TRPCError, initTRPC } from '@trpc/server';
import { ZodError, z } from 'zod';
import { contributions } from './contribution';
import {
	context,
	openWorkspace,
	permissionsIn,
	sessionOf,
	type Context,
	type Database,
	type Identity
} from './context';
import { readRefusal, refuse } from './refusal';

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

/**
 * the flags a refusal names, and where: *in this workspace* only where every one of them is a
 * record flag, since those are what a workspace's grant narrows. An organization flag is held
 * across the organization or not at all, and saying *in this workspace* of one sends whoever reads
 * the log to the wrong place.
 */
function refused(names: readonly Flag[]): string {
	const flags = [...new Set(names)];
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
 *
 * **A write the version took away is refused for the version** (effort 857, requirement 6): where
 * a newer rentable upgraded the workspace open past what this one writes, the identity's writes are
 * already cleared, and a missing create, edit or delete is refused with the shell's own code for
 * it, which reads as its sentence, since updating is what the person can do about it.
 */
export function refuseMissing(
	identity: Identity | null,
	acts: readonly Flag[]
): asserts identity is Identity {
	const missing = acts.filter((act) => !identity || !permits(identity.permissions, act));

	if (
		identity?.readOnlyByVersion &&
		missing.some((act) => (WRITE_FLAGS as readonly Flag[]).includes(act))
	) {
		throw refuse('host.workspaceReadOnlyByVersion');
	}

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
 * empty gate is a compile error at the place it would be written.
 */
export type Flags = readonly [Flag, ...Flag[]];
type Acts = Flags;

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
	/**
	 * the workspace the call is about is read off its input, and the flags are asked there:
	 * `procedure.permittedIn`'s, beside `flags` where it names any and `member` where it names none.
	 */
	workspace?: true;
};

/**
 * What a write that landed asks for once it has: the workspace pushed to its replica, which is
 * sync's to do.
 *
 * **Bound in, never imported**, for the reason the root router is in `./caller`: sync is a feature,
 * and this home sits below the features. `$lib/app/caller` binds sync's request as the root layout
 * loads, before anything can call a procedure. Unbound, as under a test's own router, a write asks
 * for nothing, which is what the request itself does wherever there is no window to say it on.
 */
let requestSync: () => void = () => {};

/** Bind what a landed write asks for. Called once, by `$lib/app/caller`. */
export function bindSyncRequest(request: () => void) {
	requestSync = request;
}

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
 * **`requirePermission` and `requireAnyPermission` are called rather than used.** Each is a
 * factory, because what it refuses depends on which acts the procedure asked for; everything else
 * here is a middleware and goes straight into a `.use()`.
 */
export const middleware = {
	/**
	 * hands the procedure what the features contribute, as `ctx.contributions`: what a feature
	 * reads of the ones depending on it without importing them (`$lib/feature/feature`, under
	 * *What a feature contributes*). Every procedure starts with it, and a kind is read from the
	 * bound value when a procedure reads it rather than when this module loads (`./contribution`).
	 */
	contribute: t.middleware(async ({ next }) => next({ ctx: { contributions } })),
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
	 * **A factory rather than a middleware**, as `requireAnyPermission` is: what it refuses depends
	 * on which acts a procedure asked for, and those are known where the procedure is declared
	 * rather than here.
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
	/**
	 * asks sync to push the open workspace once a write has landed.
	 *
	 * **Not for a workspace that is not open** (effort 846, requirement 15): a write that went to
	 * Turso directly is already where a push would carry it, and the open workspace's replica holds
	 * nothing new. `procedure.permittedIn` says which it reached, and a procedure declared any other
	 * way writes the open one.
	 */
	scheduleWorkspaceSync: t.middleware(async ({ ctx, next }) => {
		const result = await next();

		if (result.ok && !('opened' in ctx && ctx.opened === false)) {
			requestSync();
		}

		return result;
	})
};

export const autosync = () => middleware.scheduleWorkspaceSync;

/**
 * What a call naming a workspace may say: which one, or nothing for the one open.
 *
 * **Optional whole, and optional within**, so a call that names nothing reads exactly as it did
 * before a workspace could be named: `transfer.get()` is the open workspace's.
 */
const NamingAWorkspace = z.object({ workspaceId: z.string().min(1).optional() }).optional();

/** What a call naming a workspace runs against, and whether that is the one this machine has open. */
type Reached = { opened: true } | { opened: false; db: Database; identity: Identity };

/**
 * the workspace a call names, reached: the open one as the context already holds it, and any
 * other on Turso, with what the member may do there.
 *
 * **Absent or the open one changes nothing**, so the open workspace keeps its replica, offline
 * included, and its permissions as the context folded them. **Any other is the session's to
 * answer**: refused with the shell's own code where the member holds no grant on it, since the
 * shell refuses the same request for the same reason ([[rules/api-layer]], under *Errors*), and
 * otherwise its database over Turso and the member's permissions folded for it, its pins and its
 * grant's access, as the context folds them for the open one (`permissionsIn`).
 */
async function reach(
	ctx: Context,
	identity: Identity,
	workspaceId: string | undefined
): Promise<Reached> {
	if (workspaceId === undefined || workspaceId === (await openWorkspace(ctx.host))) {
		return { opened: true };
	}

	const session = await sessionOf(ctx.host);

	if (!session?.workspaces.some((workspace) => workspace.id === workspaceId)) {
		throw refuse('host.noGrant');
	}

	// the version's verdict is on the workspace open, so it is not carried to another.
	return {
		opened: false,
		db: ctx.databaseOf(workspaceId),
		identity: {
			accountId: identity.accountId,
			username: identity.username,
			permissions: permissionsIn(session, workspaceId)
		}
	};
}

/**
 * PROCEDURES
 *
 * **Six ways to declare a procedure, and the difference is who may call it.** `permitted`,
 * `permittedAny` and `permittedBy` name the flags a call needs; `permittedIn` names them too, asked
 * in the workspace the call's input names; `member` needs only somebody signed in; `public` needs
 * nobody. The ones that name a flag compose onto `member` rather than replacing it, so a permitted
 * procedure is a member procedure that asks one question more, and everything `requireIdentity`
 * narrows downstream survives.
 *
 * **A flag where there is one, and `member` only where there is none**: a member's own act, a read
 * open to every member whose answer leaves out what they may not view, and an act whose check is
 * Rust's alone, such as the owner's. `public` is for a call with nobody to name, and asking what an
 * account may do is the opposite question, so no flag reaches it.
 *
 * *There was one kind until 2026-08-20, called `public`, and it was every procedure in the
 * application; requirement 7 of [[efforts/capabilities-only-one-surface-got]] drew the shell signed
 * out, and `member` took over the line the context used to hold.*
 *
 * Each way of declaring a procedure records itself in its `meta`, which is what lets
 * `tests/flags.test.ts` walk the router and name a procedure that says nothing about who may call
 * it. How many there are of each is counted there and in [[rules/api-layer]], under *Who may
 * call*, rather than here.
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
	 * On its own it is for a member's own act, or a read open to every member whose answer leaves out
	 * what they may not view. An act with a flag is `permitted`, which asks this first; the owner's
	 * acts and the mark's name theirs since effort 838's ticket 17.
	 *
	 * middlewares: [log, contribute, requireIdentity]
	 */
	member: t.procedure
		.meta({ member: true })
		.use(middleware.log)
		.use(middleware.contribute)
		.use(middleware.requireIdentity),
	/**
	 * public
	 *
	 * a call with no actor to name, and **host-only is the test rather than harmless-looking**.
	 * These reach `ctx.host` and never `ctx.db`: this machine's own settings, its updater, what the
	 * shell knows about syncing, and the calls that come before there is anybody to act as (the
	 * consent, creating or connecting an organization, and opening a link). A procedure that
	 * touches the workspace is not public however read-only it looks, because the workspace belongs
	 * to somebody.
	 *
	 * middlewares: [log, contribute]
	 */
	public: t.procedure.meta({ public: true }).use(middleware.log).use(middleware.contribute),
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
	 * `@rentable/workspace-permission` is where the names live and `role/permission.rs` carries the
	 * same bits under the same names, and a test on each side keeps the two from drifting.
	 *
	 * **A bulk procedure names the flag of the single act**, and so does an undo's inverse: deleting
	 * a selection is deleting, and restoring what was deleted is an edit of it (requirement 1).
	 *
	 * middlewares: [log, contribute, requireIdentity, requirePermission(...acts)]
	 */
	permitted: (...acts: Acts) =>
		t.procedure
			.meta({ flags: [...acts] })
			.use(middleware.log)
			.use(middleware.contribute)
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
	 * middlewares: [log, contribute, requireIdentity, requireAnyPermission(...acts)]
	 */
	permittedAny: (...acts: Acts) =>
		t.procedure
			.meta({ anyOf: [...acts] })
			.use(middleware.log)
			.use(middleware.contribute)
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
	 * middlewares: [log, contribute, requireIdentity, input, flagsOf(input)]
	 */
	permittedBy: <Schema extends z.ZodType>(
		possible: Flags,
		schema: Schema,
		flagsOf: (input: z.output<Schema>) => readonly Flag[]
	) =>
		t.procedure
			.meta({ byInput: possible })
			.use(middleware.log)
			.use(middleware.contribute)
			.use(middleware.requireIdentity)
			.input(schema)
			.use(async ({ ctx, input, next }) => {
				refuseMissing(ctx.identity, flagsOf(input as z.output<Schema>));

				return next();
			}),
	/**
	 * permittedIn
	 *
	 * a call about one workspace the member holds a grant on, named by its input as
	 * `{ workspaceId }`, refused where the member may not do the named acts **in that workspace**
	 * (effort 846, requirement 15).
	 *
	 * **Nothing named is the workspace open**, and the call is then exactly `permitted`'s, so a
	 * caller that names nothing is unchanged. A workspace that is not open is reached on Turso
	 * (`Context.databaseOf`) and never opened here: the window keeps the workspace it has, and no
	 * replica is made for the other. The flags asked are the member's there, its pins and its
	 * grant's access, never the open workspace's, and a member with no grant on it is refused.
	 *
	 * **The workspace is read before the permission**, as `permittedBy` reads its input, because
	 * which permissions to ask is read off it; only `{ workspaceId }` is, so the procedure's own
	 * input is still parsed after the gate, and a call refused for its flags is refused whatever
	 * else it carried. The procedure's own input, an object, is merged beside it.
	 *
	 * **Naming no acts is a member's read of that workspace**, recorded as `member`: the gate is
	 * then holding a grant on it. `transfer.held` is one, open to every member and answering with
	 * nothing of a kind they may not view there.
	 *
	 * The context it hands on says whether the workspace is the open one (`opened`), which the
	 * autosync middleware reads so a write to Turso asks no push of the open replica.
	 *
	 * middlewares: [log, contribute, requireIdentity, { workspaceId }, requirePermission(...acts) there]
	 */
	permittedIn: (...acts: readonly [] | Flags) =>
		t.procedure
			.meta(
				acts.length > 0 ? { flags: [...acts], workspace: true } : { member: true, workspace: true }
			)
			.use(middleware.log)
			.use(middleware.contribute)
			.use(middleware.requireIdentity)
			.input(NamingAWorkspace)
			.use(async ({ ctx, input, next }) => {
				const reached = await reach(ctx, ctx.identity, input?.workspaceId);
				const identity = reached.opened ? ctx.identity : reached.identity;

				refuseMissing(identity, acts);

				return next({ ctx: reached.opened ? { opened: true as const } : reached });
			})
};
