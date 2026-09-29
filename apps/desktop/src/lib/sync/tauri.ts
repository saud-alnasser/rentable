import { invoke } from '@tauri-apps/api/core';

import type { RemoteSyncState, ReplicationRefusal, SessionStanding, SyncHost } from './host';

/**
 * remote sync's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat under `remoteSync` until effort 840 gave
 * sync its own port.
 */
export const tauri = {
	getState: () => invoke<RemoteSyncState>('plugin:sync|state_get'),
	replicate: () =>
		invoke<{
			pushed: boolean;
			received: boolean;
			refusal: ReplicationRefusal;
			standing: SessionStanding;
		}>('plugin:organization|session_replicate'),
	push: () => invoke<boolean>('plugin:sync|push'),
	renameWorkspace: (name: string) =>
		invoke<RemoteSyncState>('plugin:organization|workspace_rename', { name })
} satisfies SyncHost;
