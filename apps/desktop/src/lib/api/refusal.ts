import type { ComplexRefusalCode } from '$lib/complex/refusal';
import type { UnitRefusalCode } from '$lib/complex/unit/refusal';
import type { ContractRefusalCode } from '$lib/contract/refusal';
import type { HostRefusalCode } from '$lib/error/tauri';
import type { PaymentRefusalCode } from '$lib/payment/refusal';
import type { TenantRefusalCode } from '$lib/tenant/refusal';
import type { TransferRefusalCode } from '$lib/transfer/refusal';
import { TRPCError } from '@trpc/server';

/**
 * REFUSALS
 *
 * What a procedure says when it turns a request away that a person could have made: a code and
 * the values the sentence needs, never the sentence. The interface turns the code into words in
 * the reader's language (`error/refusal.ts`), and a form reads the code to decide which field the
 * refusal belongs under ([[rules/api-layer]], under *Errors*).
 *
 * *Why a code rather than a sentence: a sentence written here is written in one language, a form
 * that places it has to match its words, and a reader who switches language holds sentences
 * cached in the one they left. Effort 832, requirement 23.*
 *
 * Each concept and capability names its own refusals in its own `refusal.ts`, and this is their union. The imports
 * are types alone, erased before anything runs, so the plumbing a feature raises through never
 * loads a feature. `host` is the shell's: a Rust refusal carries its reason, and the reason is named here the way a
 * router's code is, so one lookup finds either sentence. A procedure raises one only as the earlier
 * of two refusals of the same thing: the organization router refuses a role or an override that
 * writes a kind of record without viewing it with the code Rust refuses it with.
 */
export type RefusalCode =
	| ComplexRefusalCode
	| ContractRefusalCode
	| HostRefusalCode
	| PaymentRefusalCode
	| RecordRefusalCode
	| TenantRefusalCode
	| TransferRefusalCode
	| UnitRefusalCode;

/** the values a refusal's sentence is built from: a name, an id, a count of days. */
export type RefusalParams = Record<string, string | number>;

/** what a refused call carries, on the error's `cause` and in the formatted shape's `data`. */
export type Refusal = { code: RefusalCode; params: RefusalParams };

/**
 * The refusal of a request, as the error a procedure throws: `throw refuse('contract.endBeforeStart')`.
 *
 * **The message is for a developer.** It is the code and its values, which is what a log line or
 * a failing test wants to read, and nothing shows it to a person. The refusal itself rides on the
 * `cause`, which tRPC keeps on the error an in-process caller receives, and `errorFormatter` copies
 * it into the shape a transport would send.
 */
export function refuse(code: RefusalCode, params: RefusalParams = {}): TRPCError {
	const values = Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : '';

	return new TRPCError({
		code: 'BAD_REQUEST',
		message: `refused: ${code}${values}`,
		cause: { refusal: { code, params } satisfies Refusal }
	});
}

/**
 * The refusal an error carries, or `null` where it carries none.
 *
 * Read off the `cause` an in-process caller receives, or off the formatted shape's `data` where the
 * error crossed a transport. Anything not in the shape `refuse` builds is not a refusal.
 */
export function readRefusal(error: unknown): Refusal | null {
	if (typeof error !== 'object' || error === null) return null;

	const { cause, data } = error as { cause?: unknown; data?: unknown };

	return refusalIn(cause) ?? refusalIn(data);
}

function refusalIn(holder: unknown): Refusal | null {
	if (typeof holder !== 'object' || holder === null) return null;

	const refusal = (holder as { refusal?: unknown }).refusal;

	if (typeof refusal !== 'object' || refusal === null) return null;

	const { code, params } = refusal as { code?: unknown; params?: unknown };

	if (typeof code !== 'string') return null;

	return {
		code: code as RefusalCode,
		params: typeof params === 'object' && params !== null ? (params as RefusalParams) : {}
	};
}

/**
 * The refusals of a stated identity, by code. Any concept's record can meet them, so they are
 * named for the record rather than for a concept, and sit here beside the union rather than in a
 * concept's `refusal.ts`.
 */
export type RecordRefusalCode = 'record.idTaken' | 'record.idTakenNamed';

/**
 * A STATED IDENTITY
 *
 * the creating client mints a row's identity, and a caller may state one instead, which is
 * how undoing a deletion puts a row back as the record it was rather than as a copy of it
 * (ADR 0026).
 *
 * A stated identity has to be free, and that is not a formality: an undo replays an id that
 * was deleted, and nothing stops the same id being stated twice. Without this the collision
 * arrives as a constraint failure the user is shown as an unexpected error, rather than as the
 * refusal it is.
 *
 * *It used to say the engine hands out the next id above the highest in use, which was the
 * reason a freed id could be taken. That rule is gone (`newId` in
 * `$lib/platform/database/identity` is where identities come from now), and the check it justified
 * is not, because a stated id is still a stated id. It sat beside `newId` until effort 840, when
 * the refusal it raises kept the database transport importing this wiring.*
 *
 * @param existing whatever row the caller's lookup found; any row means the id is taken.
 * @param named how the offending record is referred to, where the caller is acting on a set and
 * has to say which member of it was refused. A caller acting on one record omits it: the record
 * is the one it was asked about.
 */
export function ensureIdFree(existing: unknown, named?: string) {
	if (existing) {
		throw named ? refuse('record.idTakenNamed', { named }) : refuse('record.idTaken');
	}
}
