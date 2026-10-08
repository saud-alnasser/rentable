<script lang="ts">
	import {
		accessIn,
		floorsUnreadableIn,
		readOnlyByVersionIn,
		workspacePermissionsIn
	} from '$lib/api/context';
	import { contributionsTo } from '$lib/feature/surface';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
	import { memberPermissions } from '$lib/permission';

	/**
	 * Where the reader stands in the workspace open, read once for the whole window and held where
	 * every record control reads it (`$lib/permission`). Draws nothing.
	 *
	 * **The same two reads the tRPC context folds**: the session's permissions, off the verified
	 * row, with what is pinned for the reader in the workspace this machine has open, and that
	 * workspace's grant, which decides whether anything in it may be written. Both queries are
	 * read again on every heartbeat and on a workspace switch (`startup/startup.ts`), which is what
	 * carries a narrowed role or a read-only grant here.
	 *
	 * Mounted in the frame while somebody is signed in, and nothing is held once it goes. The
	 * session is the organization's, read through what it contributes to the workspace.
	 */
	const organizationQuery = contributionsTo('workspace').useOrganizationState();
	const remoteSyncQuery = useFetchRemoteSyncState();

	$effect(() => {
		const session = organizationQuery.data?.session;
		const heldByVersion = organizationQuery.data?.heldByVersion ?? [];
		const workspace = remoteSyncQuery.data?.workspace;

		memberPermissions.hold(
			session && workspace
				? {
						permissions: workspacePermissionsIn(session, workspace.remoteId),
						accessLevel: accessIn(session, workspace.remoteId),
						locked: session.locked,
						readOnlyByVersion: readOnlyByVersionIn(heldByVersion, workspace.remoteId),
						floorsUnreadable: floorsUnreadableIn(heldByVersion, workspace.remoteId)
					}
				: null
		);
	});

	$effect(() => () => memberPermissions.hold(null));
</script>
