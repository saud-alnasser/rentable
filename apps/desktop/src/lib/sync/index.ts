/**
 * SYNC'S ENTRY
 *
 * what another concept may import of sync: what startup's root listens to while the application
 * runs (the sync manager, a session ended on another machine, and a sign-out), whether the
 * organization admits the machine, the replica's pushes, the account's initials, the bound on a
 * workspace's name, the shapes its host port hands over, and the request for a push the
 * composition root binds into every write that asks for one.
 *
 * **It loads under Node**, since startup's machine and the composition root import it. Sync's reads
 * and the push the organization's standing offers are the window's, in `./ui`.
 */
export { accountInitials } from './account';
export { organizationAdmission, type Admission } from './admission';
export { startWorkspaceSyncManager } from './autosync';
export { listenForSessionEnded, requestWorkspaceSync } from './event';
export {
	WORKSPACE_NAME_LIMIT,
	type RemoteSyncState,
	type RemoteSyncWorkspace,
	type SyncHost
} from './host';
export { listenForSignOut, requestSignOut } from './sign-out';
export { announceReceivedRows, syncWorkspaceBeforeExit, syncWorkspaceNow } from './workspace';
