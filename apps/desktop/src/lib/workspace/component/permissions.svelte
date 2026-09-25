<script lang="ts">
	import { accessIn } from '$lib/api/context';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import { memberPermissions } from '$lib/workspace/permission';

	/**
	 * Where the reader stands in the workspace open, read once for the whole window and held where
	 * every record control reads it (`workspace/permission.ts`). Draws nothing.
	 *
	 * **The same two reads the tRPC context folds**: the session's permissions, off the verified
	 * row, and the workspace this machine has open, whose grant decides whether anything in it may
	 * be written. Both queries are read again on every heartbeat and on a workspace switch
	 * (`layout/startup.ts`), which is what carries a narrowed role or a read-only grant here.
	 *
	 * Mounted in the frame while somebody is signed in, and nothing is held once it goes.
	 */
	const organizationQuery = useFetchOrganizationState();
	const remoteSyncQuery = useFetchRemoteSyncState();

	$effect(() => {
		const session = organizationQuery.data?.session;
		const workspace = remoteSyncQuery.data?.workspace;

		memberPermissions.hold(
			session && workspace
				? {
						permissions: session.permissions,
						accessLevel: accessIn(session, workspace.remoteId)
					}
				: null
		);
	});

	$effect(() => () => memberPermissions.hold(null));
</script>
