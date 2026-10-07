import { invoke } from '@tauri-apps/api/core';

import type { HeldByVersion } from '$lib/organization';

import type { RemoteSyncState, ReplicationRefusal, SessionStanding, SyncHost } from './host';

/**
 * remote sync's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's.** Each command is a plugin's,
 * invoked as `plugin:<plugin>|<command>`: the replica's state and the push are the `sync` plugin's,
 * and the replication and the rename are the `organization` plugin's, because in Rust both act on
 * the organization (the member's session, the sealed workspace row) and `sync` names nothing of
 * `organization`. The arguments are spelled as they were in the platform facade, where they sat
 * under `remoteSync` until effort 840 gave sync its own port.
 */
export const tauri = {
	getState: () => invoke<RemoteSyncState>('plugin:sync|state_get'),
	replicate: () =>
		invoke<{
			pushed: boolean;
			received: boolean;
			refusal: ReplicationRefusal;
			standing: SessionStanding;
			heldByVersion: HeldByVersion[];
		}>('plugin:organization|session_replicate'),
	push: () => invoke<boolean>('plugin:sync|push'),
	renameWorkspace: (name: string) =>
		invoke<RemoteSyncState>('plugin:organization|workspace_rename', { name }),
	discardUnsent: () => invoke<RemoteSyncState>('plugin:organization|session_discard_unsent')
} satisfies SyncHost;
