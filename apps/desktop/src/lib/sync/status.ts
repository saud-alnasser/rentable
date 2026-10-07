import type { RemoteSyncState } from './host';
import type { Tone } from '@rentable/design/tone.js';
import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
import { DAY, formatLocaleDate, formatLocaleRelativeTime } from '$lib/platform/locale';

/**
 * WHERE THIS MACHINE STANDS WITH THE ORGANIZATION ON TURSO
 *
 * One answer, in a fixed order of precedence, because the order is a decision: a machine that is
 * both refused for the account and carrying a stale fault is told about the account, which is
 * the thing the owner has to see to first.
 *
 * *Six answers stood here until the control plane retired: no control plane, cannot sign in,
 * not signed in, awaiting authorization, needs reconnect, synced. Four of them were facts about a
 * service that no longer exists; a member is in because their vault opened, and the workspace is
 * one their grant names. What is left is the account's refusal (requirement 25 of effort 819), a
 * fault the replica or the shell reported, and synced.*
 *
 * **The answer is a named state with a tone again, at the human's choice of 2026-10-02**
 * (effort 846, requirement 12). Effort 828, requirement 25, had retired the coloured word for a
 * sentence, and a person reading the block could not tell at a glance whether sync was healthy.
 * This reverses that: five states, each a word in a tone of its own, and the moment of the last
 * reach on a line of its own beneath it. The order above did not move.
 */

/**
 * what stands in the way of replicating, read in the order above, where something does.
 *
 * Kept apart from the state because the two "needs attention" answers are one state and two
 * explanations: the block says the account's sentence under one and the credential's under the
 * other.
 */
export type SyncProblem =
	| 'accountRefused'
	| 'credentialRefused'
	| 'organizationChangesUnsendable'
	| 'changesUnsendable'
	| 'needsReconnect';

export const syncProblemOf = (state: RemoteSyncState): SyncProblem | null => {
	// the organization's account, refused by Turso: a fact from a replication that reached Turso
	// and was turned away, read before every other answer because a person over quota and a
	// person offline need different things (requirement 25).
	if (state.accountRefusal) {
		return 'accountRefused';
	}

	// this member's credential, refused by Turso and not settled by a reconnect: a lock-out
	// rotated it and no re-sealed one has arrived. Read before a fault, because it is a definite
	// answer about why nothing syncs where a fault is a stale report.
	if (state.credentialRefusal) {
		return 'credentialRefused';
	}

	// changes this machine holds that the organization refuses since an upgrade (effort 857,
	// ticket 20), read before the workspace's: the organization is what says who may do what, and
	// nothing of it moves until the person discards them.
	if (state.unsendableOrganizationChanges) {
		return 'organizationChangesUnsendable';
	}

	// changes this machine holds that the workspace refuses since an upgrade (effort 857, ticket
	// 13): nothing goes either way until the person discards them, a definite answer that
	// waits on them where a fault is a stale report.
	if (state.unsendableChanges) {
		return 'changesUnsendable';
	}

	// the one fault in the list, and the only one a person can act on by doing something.
	if (state.workspace.lastError) {
		return 'needsReconnect';
	}

	return null;
};

/** the five states the sync group names (effort 846, requirement 12). */
export type SyncStatus =
	'upToDate' | 'syncing' | 'notYetReached' | 'needsAttention' | 'needsReconnecting';

/**
 * @param inFlight whether a replication is running now (`sync/activity.svelte.ts`).
 *
 * **A problem keeps its state while a retry runs.** A machine over quota is still over quota
 * while the next attempt is out, and a word that flickered to "syncing" on every retry would
 * hide the one thing the owner has to see. Syncing is said only over a machine that has nothing
 * wrong: one that is up to date, or one that has not reached Turso yet and is trying.
 *
 * *A machine no replication has ever gone through on, a fresh machine opened offline or one
 * whose every attempt was turned away before anything completed, read as synced until review
 * round two of effort 828 found it saying "up to date".*
 */
export const syncStatusOf = (state: RemoteSyncState, inFlight = false): SyncStatus => {
	switch (syncProblemOf(state)) {
		case 'accountRefused':
		case 'credentialRefused':
		case 'organizationChangesUnsendable':
		case 'changesUnsendable':
			return 'needsAttention';
		case 'needsReconnect':
			return 'needsReconnecting';
		case null:
			break;
	}

	if (inFlight) {
		return 'syncing';
	}

	return state.lastReachedAt === null ? 'notYetReached' : 'upToDate';
};

/**
 * each state's tone, from the one vocabulary ([[rules/interface]], *Tone*). Not yet reached is
 * neutral: it is not a fault, a fresh machine offline is the ordinary case, and nothing is owed.
 */
export const SYNC_STATUS_TONE = {
	upToDate: 'success',
	syncing: 'info',
	notYetReached: 'neutral',
	needsAttention: 'warning',
	needsReconnecting: 'error'
} as const satisfies Record<SyncStatus, Tone>;

/** the state's word, in the reader's language. */
export const syncStatusWord = (status: SyncStatus, LL: TranslationFunctions): string =>
	LL.organization.standing.state[status]();

/**
 * When this machine last reached Turso, drawn whenever it has.
 *
 * **How it says the moment depends on how far back it is**: within a day it is relative, in the
 * reader's own words ("last reached Turso 2 minutes ago"); further back it is the date and the
 * time. Before any replication went there is no moment and no line; the state says not yet
 * reached. *It was the second half of one sentence beside the standing until effort 846, which
 * gave the state its own word and the moment a line of its own.*
 */
export const syncLastReachedLine = (
	moment: number | null,
	locale: Locales,
	now: number,
	LL: TranslationFunctions
): string | null => {
	if (moment === null) {
		return null;
	}

	if (now - moment < DAY) {
		return LL.organization.standing.lastReachedRecently({
			moment: formatLocaleRelativeTime(locale, moment, now)
		});
	}

	return LL.organization.standing.lastReached({
		moment: formatLocaleDate(locale, moment, { dateStyle: 'medium', timeStyle: 'short' })
	});
};

export const syncFaultOf = (state: RemoteSyncState): string | null =>
	state.workspace.lastError ?? null;
