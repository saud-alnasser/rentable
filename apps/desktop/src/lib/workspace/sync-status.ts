import type { RemoteSyncState } from '$lib/platform/host';
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
 * **The answer was a badge's word until effort 828, requirement 25, and it is a sentence now.**
 * The four words stood alone, "synced" among them, and a word standing alone is what the block
 * stopped drawing; `syncStandingSentence` below is what replaced them, and the badge's tone went
 * with the badge. The order above did not move.
 */
export type SyncStatus =
	'accountRefused' | 'credentialRefused' | 'needsReconnect' | 'neverReached' | 'synced';

export const syncStatusOf = (state: RemoteSyncState): SyncStatus => {
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

	// the one fault in the list, and the only one a person can act on by doing something.
	if (state.workspace.lastError) {
		return 'needsReconnect';
	}

	// a machine no replication has ever gone through on: a fresh machine opened offline, or one
	// whose every attempt was turned away before anything completed. It is not up to date, and
	// there is no moment to say; it stands after the three that need something because each of
	// those is a definite answer about why. *It read as synced until review round two of effort
	// 828 found a fresh machine offline saying "up to date".*
	if (state.lastReachedAt === null) {
		return 'neverReached';
	}

	return 'synced';
};

export const syncFaultOf = (state: RemoteSyncState): string | null =>
	state.workspace.lastError ?? null;

/**
 * The one sentence the standing block opens with (effort 828, requirement 25).
 *
 * **A standing that needs something says what needs doing**, and nothing about a moment: the
 * moment of the last replication that went through is not the thing a person over quota needs
 * to read. **Synced says the moment**, and how it says it depends on how far back it is: within
 * a day it is relative, in the reader's own words ("up to date, checked 2 minutes ago"), because
 * a machine that reached Turso this morning is up to date by any reading; further back than a
 * day it is the date and the time, said as the last reach rather than as up to date, because a
 * machine that has not reached Turso in three days is not something this block can vouch for.
 * **Before any replication went there is no moment, and the machine has not reached Turso**,
 * which is its own standing and its own sentence; synced with no moment is that same sentence,
 * since a caller that pairs the two is describing the same machine.
 */
export const syncStandingSentence = (
	status: SyncStatus,
	moment: number | null,
	locale: Locales,
	now: number,
	LL: TranslationFunctions
): string => {
	switch (status) {
		case 'accountRefused':
			return LL.organization.standing.accountNeedsAttention();
		case 'credentialRefused':
			return LL.organization.standing.accessNeedsAttention();
		case 'needsReconnect':
			return LL.organization.standing.needsReconnecting();
		case 'neverReached':
			return LL.organization.standing.notYetReached();
		case 'synced':
			if (moment === null) {
				return LL.organization.standing.notYetReached();
			}

			if (now - moment < DAY) {
				return LL.organization.standing.upToDateChecked({
					moment: formatLocaleRelativeTime(locale, moment, now)
				});
			}

			return LL.organization.standing.lastReached({
				moment: formatLocaleDate(locale, moment, { dateStyle: 'medium', timeStyle: 'short' })
			});
	}
};
