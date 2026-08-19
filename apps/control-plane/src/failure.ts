/**
 * A refusal the caller can act on.
 *
 * **Typed, because the client has to tell three failures apart and cannot from prose.** A token
 * Google will not vouch for means sign in again; a control plane that cannot reach Google means
 * wait and retry; a malformed request means fix the caller. The same 400-ish shape for all three
 * makes the first indistinguishable from the third, and a client that guesses wrong either
 * loops or signs somebody out who was never signed out.
 *
 * The `message` is written for a person and stays lower-case, as everything user-facing in this
 * repository does, and it names the action rather than the mechanism.
 */
export class Refusal extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, status: number, message: string) {
		super(message);
		this.name = 'Refusal';
		this.code = code;
		this.status = status;
	}
}

/** the body a refusal goes out as. One shape, so a client parses one thing. */
export const refusalBody = (refusal: Refusal) => ({
	error: { code: refusal.code, message: refusal.message }
});

export const NOT_VERIFIED = 'identity_not_verified';
export const INCOMPLETE = 'identity_incomplete';
export const GOOGLE_UNREACHABLE = 'google_unreachable';
export const MALFORMED = 'malformed_request';
export const UNAVAILABLE = 'unavailable';
