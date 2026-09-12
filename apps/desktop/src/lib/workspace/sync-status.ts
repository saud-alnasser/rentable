import type { RemoteSyncState } from '$lib/platform/host';
import type { BadgeVariant } from '@rentable/design/primitive/badge/index.js';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * WHAT THE SYNC BADGE SAYS
 *
 * One word for where this machine stands with its workspace, in a fixed order of precedence,
 * because the order is a decision: a machine that is both refused for the account and carrying
 * a stale fault is told about the account, which is the thing the owner has to see to first.
 *
 * *Six answers stood here until the control plane retired: no control plane, cannot sign in,
 * not signed in, awaiting authorization, needs reconnect, synced. Four of them were facts about a
 * service that no longer exists; a member is in because their vault opened, and the workspace is
 * one their grant names. What is left is the account's refusal (requirement 25), a fault the
 * replica or the shell reported, and synced.*
 */
export type SyncStatus = 'accountRefused' | 'needsReconnect' | 'synced';

/**
 * What the badge draws for each answer.
 *
 * **Only one is `default` and two are `error`**: the account's refusal and a fault are both
 * something is wrong, in different words, and synced is the one state that is not.
 */
const VARIANT: Record<SyncStatus, BadgeVariant> = {
	accountRefused: 'error',
	needsReconnect: 'error',
	synced: 'default'
};

export const syncStatusOf = (state: RemoteSyncState): SyncStatus => {
	// the organization's account, refused by Turso: a fact from a replication that reached Turso
	// and was turned away, read before every other answer because a person over quota and a
	// person offline need different things (requirement 25).
	if (state.accountRefusal) {
		return 'accountRefused';
	}

	// the one fault in the list, and the only one a person can act on by doing something.
	if (state.workspace.lastError) {
		return 'needsReconnect';
	}

	return 'synced';
};

export const syncStatusVariant = (status: SyncStatus): BadgeVariant => VARIANT[status];

export const syncFaultOf = (state: RemoteSyncState): string | null =>
	state.workspace.lastError ?? null;

export const syncStatusLabel = (status: SyncStatus, LL: TranslationFunctions): string =>
	({
		accountRefused: LL.workspace.syncStatusAccountRefused(),
		needsReconnect: LL.workspace.syncStatusNeedsReconnect(),
		synced: LL.workspace.syncStatusSynced()
	})[status];
