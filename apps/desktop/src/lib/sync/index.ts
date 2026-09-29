/**
 * SYNC'S ENTRY
 *
 * what another concept may import of sync. For now what startup's root listens to while the
 * application runs: the sync manager, a session ended on another machine, and a sign-out.
 */
export { startWorkspaceSyncManager } from './autosync';
export { listenForSessionEnded } from './event';
export { listenForSignOut } from './sign-out';
