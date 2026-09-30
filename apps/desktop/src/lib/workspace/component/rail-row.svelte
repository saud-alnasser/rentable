<script lang="ts">
	import { contributionsTo, type ShellSlotProps } from '$lib/feature/surface';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
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
	 *
	 * **Who is signed in and who holds what are the organization's**, read through what it
	 * contributes to the workspace (`WorkspaceSurfaceContributions` in `../workspace.ts`), so the
	 * workspace imports nothing of the organization.
	 */
	let { signedOut, onSwitch }: ShellSlotProps['workspace-menu'] = $props();

	// asking who is signed in on a machine where nobody is would be refused by design and
	// reported as a failure, so the row that already knows the answer does not ask.
	const remoteSyncQuery = useFetchRemoteSyncState(() => !signedOut);
	const organization = contributionsTo('workspace');
	const organizationQuery = organization.useOrganizationState();

	const workspace = $derived(remoteSyncQuery.data?.workspace);
	// the workspaces the member holds a grant on, which is what the menu lists; the one that is
	// open is named by the same sync record the trigger takes its name from.
	const workspaces = $derived(organizationQuery.data?.session?.workspaces ?? []);
</script>

{#if signedOut}
	<WorkspaceLocked />
{:else if workspace}
	<WorkspaceMenu {workspace} {workspaces} openId={workspace.remoteId} {onSwitch} />
{/if}
