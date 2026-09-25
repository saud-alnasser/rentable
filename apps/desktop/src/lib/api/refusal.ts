import type { ComplexRefusalCode, UnitRefusalCode } from '$lib/complex/complex';
import type { ContractRefusalCode } from '$lib/contract/contract';
import type { HostRefusalCode } from '$lib/error/tauri';
import type { PaymentRefusalCode } from '$lib/payment/payment';
import type { RecordRefusalCode } from '$lib/platform/database/identity';
import type { TenantRefusalCode } from '$lib/tenant/tenant';
import type { WorkspaceRefusalCode } from '$lib/workspace/workspace';
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
 * Each concept names its own refusals beside the rules that raise them, and this is their union.
 * `host` is the shell's: a Rust refusal carries its reason, and the reason is named here the way a
 * router's code is, so one lookup finds either sentence. No procedure raises one.
 */
export type RefusalCode =
	| ComplexRefusalCode
	| ContractRefusalCode
	| HostRefusalCode
	| PaymentRefusalCode
	| RecordRefusalCode
	| TenantRefusalCode
	| UnitRefusalCode
	| WorkspaceRefusalCode;

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
