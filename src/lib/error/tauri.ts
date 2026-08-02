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
	'preconditionFailed',
	'busy',
	'timedOut',
	'integrity',
	'io',
	'network',
	'database',
	'credential',
	'internal'
] as const;

export type TauriErrorCode = (typeof TAURI_ERROR_CODES)[number];

export type TauriError = {
	code: TauriErrorCode;
	message: string;
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
 * the discriminant a rejected value carries, or `null` when it was raised
 * inside typescript and never crossed the boundary.
 */
export function toTauriErrorCode(error: unknown): TauriErrorCode | null {
	return isTauriError(error) ? error.code : null;
}
