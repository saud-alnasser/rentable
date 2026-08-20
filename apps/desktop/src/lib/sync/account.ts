import type { RemoteSyncAccount, RemoteSyncState } from '$lib/platform/host';

/**
 * THE ACCOUNT
 *
 * who this machine is signed in as, read off the state the shell reported.
 *
 * **Its own file rather than a function in `./sign-in`, and the reason is the import graph.**
 * That file performs the acts — it reaches the shell, so importing it pulls the Tauri facade and
 * every `@tauri-apps` package behind it into whatever imported it. `$lib/api/context` resolves the
 * acting user on every request and is deliberately free of that runtime, which it cannot be while
 * the read it needs lives beside the calls.
 *
 * Nothing here calls anything. It is one question asked of one payload.
 */

/**
 * who this machine is signed in as, or nobody.
 *
 * **Read off the account rows rather than off the workspace, and that is the point.** The only
 * writer of `workspace.accountId` was the Google Drive link, so every read that went through it
 * could answer only for a workspace linked to a folder — which is not what *who is signed in*
 * means. Drive sync retired and took the field with it.
 *
 * **A row is not a sign-in.** The row outlives the credentials deliberately: Rust keeps it so that
 * whatever was linked under it can still say what it is waiting for. `needsReconnect` is written
 * in exactly the two places that have just deleted those credentials, signing out and being
 * superseded by a sign-in as somebody else, so it is the status that means *this machine no
 * longer holds this identity*, and the rest mean it does.
 *
 * *This said three until 2026-08-20 and named a failed refresh as the third. It is not one:
 * `refresh_google_access_token` returns the failure and writes nothing, and `delete_google_credentials`
 * has exactly the two callers above. Corrected where it was found, while counting the places a
 * picture has to be cleared.*
 *
 * At most one identity is held at a time. Rust signs out of every other account on the way through
 * a sign-in for exactly this reason, so the first match is the only match rather than the one
 * iteration order happened to reach.
 */
export function signedInAccount(state?: RemoteSyncState | null): RemoteSyncAccount | null {
	return state?.accounts.find((account) => account.status !== 'needsReconnect') ?? null;
}
