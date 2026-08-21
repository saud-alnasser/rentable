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
/** asking to act as somebody without presenting a credential at all. */
export const UNAUTHENTICATED = 'unauthenticated';
/**
 * the session presented is not one this control plane will renew.
 *
 * Never issued, run out, or declined — one code for all three, because the client's move is the
 * same for each and telling them apart tells whoever holds a string they should not have whether
 * it was ever real. Distinct from {@link UNAUTHENTICATED}, which is presenting nothing at all,
 * and from {@link NOT_VERIFIED}, which is Google refusing, and from
 * {@link SESSION_LIFETIME_REACHED}, which is the sign-in having reached a month.
 */
export const SESSION_EXPIRED = 'session_expired';
/**
 * the sign-in itself is a month old, and no refresh extends it.
 *
 * **Distinct from {@link SESSION_EXPIRED} because the two ask different things of the person.**
 * An expired refresh window is satisfied by reconnecting — the client refreshes silently and
 * nobody types anything. This one is satisfied only by a real Google re-login, so a client that
 * treated them alike would either sit waiting for a network that will not help, or throw somebody
 * back to Google every time they came back from a long weekend.
 *
 * **It tells a caller that the token it holds was once real**, which {@link SESSION_EXPIRED} is
 * worded to avoid. That is accepted deliberately: requirement 15 asks for the distinction, and
 * what leaks is only that some token presented here was issued at least a month ago — not whose,
 * and not anything that can be presented again.
 */
export const SESSION_LIFETIME_REACHED = 'session_lifetime_reached';
/** a workspace this account is not a member of. Membership is the whole of the answer. */
export const NOT_A_MEMBER = 'not_a_member';
/**
 * a member of the workspace, asking for something their membership does not allow.
 *
 * **Distinct from {@link NOT_A_MEMBER}, and the difference is what the person does next.** Not a
 * member means this workspace is not theirs to reach and the client should stop holding a replica
 * of it. This one means it *is* theirs and this particular act is not, so nothing about the
 * replica changes and what would settle it is somebody with the permission granting it.
 *
 * The first thing ever to consult a permission flag is the rename route, in #697. `permits` and
 * the column behind it have existed since the control plane had permissions at all, and until
 * then nothing in production had called either.
 */
export const NOT_PERMITTED = 'not_permitted';
export const NO_SUCH_WORKSPACE = 'no_such_workspace';

/** Turso could not be reached or would not answer. Distinct from Google for the same reason. */
export const WORKSPACE_UNAVAILABLE = 'workspace_unavailable';
/**
 * the client was built against an older schema than the workspace has been migrated to.
 *
 * **Nothing retries this and no token goes out with it.** Decision 06: a client allowed to sync
 * against a schema it does not understand replicates it and then writes against columns it does
 * not know about, and by the time a write fails its replica has already diverged. The action is
 * for a person — update the application — which is why the message names it.
 */
export const CLIENT_OUT_OF_DATE = 'client_out_of_date';
/**
 * the client was built against a *newer* schema than this build of the API ships a migration for.
 *
 * The other side of the same guard, and the only honest answer: this service cannot migrate a
 * workspace to a version it holds no migration for, and minting at its own version would hand a
 * newer client a database missing the columns it is about to write to. It is a moment that
 * passes — the deploy carrying those migrations is what ends it — so it says try again.
 */
export const SERVICE_OUT_OF_DATE = 'service_out_of_date';
