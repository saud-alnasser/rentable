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
 * why a `refused` refused: one word from Rust's `RefusalReason`, spelled the same, and the one
 * thing besides the code a caller is allowed to branch on.
 *
 * **One list, mirrored rather than shared.** Rust declares it in `tauri/src/error.rs` and this is
 * the copy the interface reads; `error/tests/tauri.test.ts` reads the enum back out of that file,
 * so a word added on one side and not the other fails a test. Each word has a sentence under
 * `common.refusals.host` in both locales, which `error/refusal.ts` checks by type.
 *
 * The first four are a link's standing after its code was right (effort 828), and the connect
 * screen routes on them by name. The rest were added by effort 832, when every refusal a person
 * can cause in the shell began to carry one.
 */
export const TAURI_REFUSAL_REASONS = [
	'lapsed',
	'consumed',
	'revoked',
	'replaced',
	'codeMissing',
	'codeWrong',
	'linkUnreadable',
	'linkNotAnInvitation',
	'linkNotForAMachine',
	'anotherOrganizationHeld',
	'credentialsWrong',
	'passwordTooShort',
	'passwordChangeRequired',
	'signedOut',
	'noOrganization',
	'noMemberYet',
	'signInAgain',
	'youWereRemoved',
	'sessionsEnded',
	'keyNotInForce',
	'usernameInvalid',
	'usernameTaken',
	'roleUnknown',
	'memberMissing',
	'memberGone',
	'memberRemoved',
	'notYourself',
	'ownerProtected',
	'ownerOnly',
	'ownerMachineOnly',
	'roleLacksAct',
	'notAdministrator',
	'alreadyOwner',
	'accountNotSetUp',
	'offerPending',
	'offerAccepted',
	'nothingOffered',
	'offererGone',
	'organizationNameMissing',
	'workspaceNameMissing',
	'workspaceMissing',
	'noWorkspaceOpen',
	'noGrant',
	'grantMissing',
	'grantBeyondOwn',
	'noOrganizationCredential',
	'workspaceNewer',
	'workspaceBehind',
	'databaseRefused',
	'tursoNotConnected',
	'consentNeededAgain',
	'consentGone',
	'groupMismatch',
	'groupNeeded',
	'groupHoldsOrganization',
	'groupEmpty',
	'nothingToConnectTo',
	'createRefused',
	'tursoRefused',
	'tursoAccountRefused',
	'markTooLarge',
	'markNotAnImage'
] as const;

export type TauriRefusalReason = (typeof TAURI_REFUSAL_REASONS)[number];

/**
 * a shell refusal named as a router's refusal is: the concept `host` and the reason. It joins
 * `RefusalCode` (`$lib/api/refusal`), so the sentence is found the same way and the type check in
 * `error/refusal.ts` holds the list and the locale together.
 */
export type HostRefusalCode = `host.${TauriRefusalReason}`;

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
 * A caller that has to tell one refusal from another reads this, never the message: the message
 * is a developer's description and Rust's to reword. The four standings of a link all crossed as
 * one code until effort 828 gave them this, and every other refusal crossed as prose until 832.
 */
export function toTauriRefusalReason(error: unknown): TauriRefusalReason | null {
	const rejected = toTauriError(error);

	if (!rejected || rejected.code !== 'refused') return null;

	return TAURI_REFUSAL_REASONS.includes(rejected.reason as TauriRefusalReason)
		? (rejected.reason as TauriRefusalReason)
		: null;
}

/**
 * the discriminant a rejected value carries, or `null` when it was raised
 * inside typescript and never crossed the boundary.
 */
export function toTauriErrorCode(error: unknown): TauriErrorCode | null {
	return toTauriError(error)?.code ?? null;
}

/**
 * the payload a command rejected with, whether it arrived as it was sent or inside the error a
 * procedure wrapped it in.
 *
 * **A rejection that crossed a procedure is not the payload any more.** tRPC turns anything thrown
 * inside one that is not its own error into an `INTERNAL_SERVER_ERROR`, and keeps what was thrown
 * as its `cause`, with the payload's fields copied onto it. A read of the outer error alone finds
 * no code, which is how every refusal a `ctx.host` call raised read as unexpected until effort 832
 * (`error/tests/tauri.test.ts` pins the wrapping, so a change in the library shows up there).
 */
export function toTauriError(error: unknown): TauriError | null {
	if (isTauriError(error)) return error;

	if (error instanceof Error && isTauriError(error.cause)) return error.cause;

	return null;
}
