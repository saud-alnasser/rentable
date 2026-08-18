import { tauri, type RemoteSyncState } from '$lib/platform/tauri';
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
export function signOutOfGoogle(): Promise<RemoteSyncState> {
	return tauri.auth.google.signOut();
}
