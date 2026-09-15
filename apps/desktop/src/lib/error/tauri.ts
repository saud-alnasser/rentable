/**
 * the error shape every fallible tauri command rejects with, and the reads that
 * classify one. rust serialises its error enum as `{ code, message }`, so a
 * caller branches on the code and never on the prose.
 */

/**
 * every discriminant the rust error surface can send, in the order it declares
 * them. a code absent here is treated as not having crossed the boundary.
 */
export const TAURI_ERROR_CODES = [
	'notConfigured',
	'invalidInput',
	'notFound',
	'forbidden',
	'refused',
	'preconditionFailed',
	'busy',
	'timedOut',
	'cancelled',
	'integrity',
	'io',
	'network',
	'database',
	'credential',
	'internal'
] as const;

export type TauriErrorCode = (typeof TAURI_ERROR_CODES)[number];

/**
 * why a link admits nobody, on a `refused`: the standing behind it, after the code that opened it
 * was right. Rust's `RefusalReason`, spelled the same, and the one thing besides the code a caller
 * is allowed to branch on.
 */
export const TAURI_REFUSAL_REASONS = ['lapsed', 'consumed', 'revoked', 'replaced'] as const;

export type TauriRefusalReason = (typeof TAURI_REFUSAL_REASONS)[number];

export type TauriError = {
	code: TauriErrorCode;
	message: string;
	/** present on `refused` and on nothing else. */
	reason?: string;
};

/**
 * whether a rejected value came from a tauri command. narrows to `TauriError`,
 * so the code is safe to branch on afterwards.
 */
export function isTauriError(value: unknown): value is TauriError {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const { code, message } = value as { code?: unknown; message?: unknown };

	return typeof message === 'string' && TAURI_ERROR_CODES.includes(code as TauriErrorCode);
}

/**
 * why a `refused` refused, or `null` where the rejection was not one or carries a word this
 * side does not know.
 *
 * A caller that has to tell a dead link from a mistyped code reads this, never the sentence:
 * the sentence is written for a person and is Rust's to reword, and the four standings all
 * crossed as one code until effort 828 gave them this one.
 */
export function toTauriRefusalReason(error: unknown): TauriRefusalReason | null {
	if (!isTauriError(error) || error.code !== 'refused') return null;

	return TAURI_REFUSAL_REASONS.includes(error.reason as TauriRefusalReason)
		? (error.reason as TauriRefusalReason)
		: null;
}

/**
 * the discriminant a rejected value carries, or `null` when it was raised
 * inside typescript and never crossed the boundary.
 */
export function toTauriErrorCode(error: unknown): TauriErrorCode | null {
	return isTauriError(error) ? error.code : null;
}
