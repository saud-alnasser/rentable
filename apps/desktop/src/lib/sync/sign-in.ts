import { tauri, type RemoteSyncAccount, type RemoteSyncState } from '$lib/platform/tauri';
import { toTauriErrorCode } from '$lib/error/tauri';

/**
 * SIGNING IN
 *
 * who this machine is signed in as, as an act of its own.
 *
 * It lived inside `linkGoogleDriveWorkspace` until 2026-08-18 — signing in was a step on the way
 * to choosing a folder, so an identity could not exist without one, and identity was reachable
 * only through the surface Drive owns. A workspace whose record of truth is remote has an owner
 * and a local one has none, so the two had to come apart before either could be built on.
 *
 * Neither of these reconciles afterwards, and that is the difference from every operation in
 * `./link`: signing in and out changes who this machine is, and changes no record in the
 * workspace. There is nothing derived from a person to recompute.
 *
 * This file outlives the directory it is in. `./link` and the rest of the Drive surface retire
 * with decision 07; sign-in is Google rather than Drive, and stays.
 */

/**
 * whether a rejection is the user having abandoned the consent screen rather than something to
 * report. Rust says so with a code, so the branch does not read prose.
 */
export function isGoogleSignInCancellation(error: unknown) {
	return toTauriErrorCode(error) === 'cancelled';
}

/**
 * sign in with Google, from the consent screen to the account being held.
 *
 * Outstanding for as long as the user takes. No folder is chosen and the workspace is untouched
 * — what comes back says the account is there, not that anything is linked.
 */
export function signInWithGoogle(): Promise<RemoteSyncState> {
	return tauri.auth.google.signIn();
}

/**
 * give up the identity this machine holds.
 *
 * A workspace still linked to Drive stays linked and cannot sync, and says which of the two
 * things to do about it. Signing out is not disconnecting Drive, and does not quietly become it.
 */
export async function signOutOfGoogle(): Promise<RemoteSyncState> {
	const state = await tauri.auth.google.signOut();

	emitSignedOut();

	return state;
}

/**
 * the event a sign-out announces itself with.
 *
 * **Announced rather than returned, because the two things that must react to it are nowhere near
 * the control.** Signing out happens in settings, which is a route; what has to answer it is the
 * layout — it puts the door back up — and the API caller, which is holding a context built for
 * somebody this machine no longer has credentials for. Neither can be reached by returning a value
 * to the button that was pressed.
 *
 * It lives here rather than in `./event` because that file is Google Drive's autosync and retires
 * with it. Signing out is Google rather than Drive, and outlives the directory the same way
 * everything else in this file does.
 */
const SIGNED_OUT_EVENT = 'rentable:signed-out';

function emitSignedOut() {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT));
}

/** Watch for this machine giving up its identity. Returns its own removal. */
export function listenForSignOut(listener: () => void) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = () => listener();

	window.addEventListener(SIGNED_OUT_EVENT, handler);
	return () => window.removeEventListener(SIGNED_OUT_EVENT, handler);
}

/**
 * who this machine is signed in as, or nobody.
 *
 * **Read off the account rows rather than off the workspace, and that is the point.** The only
 * writer of `workspace.accountId` in the tree is `link_workspace_to_google_drive`, so every read
 * that goes through it can answer only for a workspace linked to a Drive folder — which is not
 * what *who is signed in* means, and after #554 will not be a thing that exists.
 *
 * **A row is not a sign-in.** The row outlives the credentials deliberately: Rust keeps it so that
 * whatever was linked under it can still say what it is waiting for. `needsReconnect` is written
 * in exactly the three places that have just deleted those credentials — signing out, being
 * superseded by a sign-in as somebody else, and a refresh that failed — so it is the status that
 * means *this machine no longer holds this identity*, and the rest mean it does.
 *
 * At most one identity is held at a time. Rust signs out of every other account on the way through
 * a sign-in for exactly this reason, so the first match is the only match rather than the one
 * iteration order happened to reach.
 */
export function signedInAccount(state?: RemoteSyncState | null): RemoteSyncAccount | null {
	return state?.accounts.find((account) => account.status !== 'needsReconnect') ?? null;
}
