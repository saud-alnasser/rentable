import type { RemoteSyncState } from '$lib/platform/host';
import type { BadgeVariant } from '@rentable/design/primitive/badge/index.js';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { signedInAccount } from '$lib/sync/account';

/**
 * WHAT THE SYNC SECTION REPORTS
 *
 * Whether this machine is reaching its workspace, as one of six answers.
 *
 * **It is a ladder and the order is load-bearing**, which is the whole reason it is a module
 * rather than three conditions in the component it draws on. What it replaces read three fields
 * and fell through to *synced* on everything else, so a build that was never told where a control
 * plane is, and a machine holding no session, both reported as synced. Both facts were on the
 * same state object and neither was read.
 *
 * The order answers a machine that is several of these at once. A build with no control plane and
 * a workspace still carrying a stale `lastError` says the first: there is nothing to reconnect
 * *to*, and offering a reconnect is worse than saying so.
 *
 * Kept out of the component for the reason `settings/update-announcement.ts` is: a runes file
 * cannot be imported by the test harness at all, so a decision left inline in one is a decision
 * nothing can drive.
 */
export type SyncStatus =
	'noControlPlane' | 'needsReconnect' | 'cannotSignIn' | 'notSignedIn' | 'pending' | 'synced';

/**
 * What the badge draws for each answer.
 *
 * **Only one of the six is `default` and only one is `error`**, and the four in between are
 * `secondary` on purpose: a build that cannot sign in and a machine awaiting authorization are
 * both *not yet*, which is a different thing from a fault. The tone vocabulary
 * ([[rules/interface]], under *Tone*) has `warning` and this badge does not, so nothing here
 * reaches for one — adding a variant to a shared primitive is a change to `@rentable/design`
 * and belongs to whoever needs it, not to this section.
 */
const VARIANT: Record<SyncStatus, BadgeVariant> = {
	noControlPlane: 'secondary',
	needsReconnect: 'error',
	cannotSignIn: 'secondary',
	notSignedIn: 'secondary',
	pending: 'secondary',
	synced: 'default'
};

export const syncStatusOf = (state: RemoteSyncState): SyncStatus => {
	const account = signedInAccount(state);

	// nowhere to reach. Every answer below this one describes a machine that has somewhere to
	// reach and has not got there, which is a different sentence.
	if (!state.controlPlaneReady) {
		return 'noControlPlane';
	}

	// the one fault in the list, and the only one a person can act on by doing something.
	//
	// **The disconnected row is read off `accounts` rather than off `account`, and that is the
	// bug this replaces.** `signedInAccount` skips a row whose status is `needsReconnect` — it is
	// looking for who is *here* — so asking it about that status can only ever answer `undefined`,
	// and a machine whose one account needs reconnecting fell through to *not signed in*. The
	// component this replaces had the same shape and reached `needsReconnect` only from a
	// `lastError`, which is why nobody saw it.
	//
	// It is `!account &&`, not an unconditional scan: on a machine where somebody is signed in and
	// a second, stale row needs reconnecting, the person is working and the stale row is not their
	// problem.
	const disconnected = !account && state.accounts.some((row) => row.status === 'needsReconnect');

	if (state.workspace.lastError || account?.lastError || disconnected) {
		return 'needsReconnect';
	}

	if (!state.googleSignInReady) {
		return 'cannotSignIn';
	}

	// **Either half is enough.** An account row outlives its credentials by design, so a machine
	// that signed out has a row and no session; a machine mid-sign-in has neither.
	if (!account || !state.session) {
		return 'notSignedIn';
	}

	if (account.status === 'pending') {
		return 'pending';
	}

	return 'synced';
};

export const syncStatusVariant = (status: SyncStatus): BadgeVariant => VARIANT[status];

/**
 * The sentence behind a fault, where there is one.
 *
 * **The badge says a word and this says what happened**, and the two are separate because the
 * word is ours and this is somebody else's: it is whatever the service or the replica reported,
 * of any length and in whatever language it was written in.
 *
 * It is here rather than read off the state in the component so that the component reads the
 * account through one function rather than reaching into it — the workspace's fault and the
 * account's are one thing to a reader, and which of the two is set is not their question.
 */
export const syncFaultOf = (state: RemoteSyncState): string | null =>
	state.workspace.lastError ??
	signedInAccount(state)?.lastError ??
	state.accounts.find((row) => row.lastError)?.lastError ??
	null;

/** What the reader is told, in their own language. */
export const syncStatusLabel = (status: SyncStatus, LL: TranslationFunctions): string =>
	({
		noControlPlane: LL.workspace.syncStatusNoControlPlane(),
		needsReconnect: LL.workspace.syncStatusNeedsReconnect(),
		cannotSignIn: LL.workspace.syncStatusCannotSignIn(),
		notSignedIn: LL.workspace.syncStatusNotSignedIn(),
		pending: LL.workspace.syncStatusPending(),
		synced: LL.workspace.syncStatusSynced()
	})[status];
