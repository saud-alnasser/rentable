<script lang="ts">
	import type { ShellSlotProps } from '$lib/feature/surface';
	import { useFetchMembers, useFetchOrganizationState } from '$lib/organization/query';
	import { useFetchRemoteSyncState } from '$lib/sync/query';
	import WorkspaceLocked from '$lib/workspace/component/locked.svelte';
	import WorkspaceMenu from '$lib/workspace/component/menu.svelte';

	/**
	 * The workspace's row at the top of the rail, which the shell draws at its `workspace-menu`
	 * place: the menu naming the workspace that is open, or, with nobody signed in, the same row
	 * holding its place with no workspace to name.
	 *
	 * **It reads what the menu draws, and the shell hands it only the frame's part**: which state
	 * the rail is in, and what a switch runs, since a switch is the sign-in path run again past the
	 * wall and that path is the startup unit's.
	 *
	 * **It carries no loading state.** The rail draws it signed in only past admission, so a
	 * workspace is open whenever the menu is drawn; the startup path also writes the state into the
	 * sync query's key before the shell mounts, so there is no first frame with nothing in it.
	 */
	let { signedOut, onSwitch }: ShellSlotProps['workspace-menu'] = $props();

	// asking who is signed in on a machine where nobody is would be refused by design and
	// reported as a failure, so the row that already knows the answer does not ask.
	const remoteSyncQuery = useFetchRemoteSyncState(() => !signedOut);
	const organizationQuery = useFetchOrganizationState();
	// gated the same way, and for the same reason: the rail is one instance across the wall and
	// the application, a refused read is kept as an error that nothing retries, and a menu drawn
	// off it would say the workspace has no members for the run of the process.
	const membersQuery = useFetchMembers(() => !signedOut);

	const workspace = $derived(remoteSyncQuery.data?.workspace);
	// the workspaces the member holds a grant on, which is what the menu lists; the one that is
	// open is named by the same sync record the header takes its name from.
	const workspaces = $derived(organizationQuery.data?.session?.workspaces ?? []);
	// how many members hold a grant on the workspace that is open.
	const memberCount = $derived(
		(membersQuery.data ?? []).filter((member) =>
			workspace?.remoteId ? member.workspaces.some((held) => held.id === workspace.remoteId) : false
		).length
	);
</script>

{#if signedOut}
	<WorkspaceLocked />
{:else if workspace}
	<!-- the members who hold a grant on this workspace, counted from the same list the
	     organization page draws. -->
	<WorkspaceMenu {workspace} {workspaces} openId={workspace.remoteId} {memberCount} {onSwitch} />
{/if}
