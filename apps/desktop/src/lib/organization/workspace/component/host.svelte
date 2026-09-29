<script lang="ts">
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/access/component/dialog.svelte';
	import { isTailored } from '$lib/organization/access/access';
	import type { useChangeAccess } from '$lib/organization/access/query';
	import { useDeleteWorkspace } from '$lib/organization/workspace/query';
	import { organizationHostState } from '$lib/organization/host.svelte';
	import type { OrganizationMember, OrganizationSession } from '$lib/organization/host';
	import WorkspaceRenameForm from './rename-form.svelte';

	/**
	 * Every surface a workspace act opens: its name, who holds it, and deleting it. Mounted by the
	 * organization host (`../../component/host.svelte`), which reads the session and the members
	 * once for every part of it and resets what is here as it goes.
	 */
	let {
		session,
		members,
		changeAccess,
		refetchState
	}: {
		/** the session the organization host reads, or `null` while it is being read. */
		session: OrganizationSession | null;
		/** the members, read by the organization host while the one surface that lists them is open. */
		members: OrganizationMember[] | undefined;
		/**
		 * the one access write a workspace's access dialog and the member's sheet share, so either
		 * surface waits while the other's write runs.
		 */
		changeAccess: ReturnType<typeof useChangeAccess>;
		/** read where the machine stands again, after a write that moves it. */
		refetchState: () => Promise<unknown>;
	} = $props();

	const workspace = $derived(organizationHostState.workspace);

	const deleteWorkspace = useDeleteWorkspace();

	// ----- the workspaces

	/**
	 * the rows the access dialog draws for a workspace: everybody who could hold it, whether what
	 * each may do there is tailored, and whether the reader holds it at full access, which is what
	 * putting any of them in gives.
	 */
	const workspaceRows = $derived.by(() => {
		const opened = workspace.changingAccess;

		if (!opened) return [];

		const givable = opened.workspace.accessLevel === 'full-access';

		return (members ?? [])
			.filter((candidate) => candidate.role !== 'owner' && candidate.id !== session?.memberId)
			.map((candidate) => {
				const grant = candidate.workspaces.find((held) => held.id === opened.workspace.id);

				return {
					id: candidate.id,
					name: candidate.username,
					access: (grant?.access ?? 'none') as AccessChoice,
					tailored: grant ? isTailored(candidate.permissions, grant) : false,
					givable
				};
			});
	});

	const changeWorkspaceAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		const opened = workspace.changingAccess;

		if (!opened) return;

		try {
			await changeAccess.mutateAsync({
				changes: changes.map((change) => ({
					workspaceId: opened.workspace.id,
					memberId: change.id,
					access: change.access
				}))
			});
			organizationHostState.workspace.changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};

	/**
	 * a workspace deleted, once the confirm has asked: the database goes with it, so the session is
	 * read again to drop the row the rail's switcher is still drawing.
	 */
	const confirmDelete = async () => {
		const opened = workspace.deleting;

		if (!opened) return;

		await deleteWorkspace.mutateAsync({ workspaceId: opened.workspace.id });
		await refetchState();
	};
</script>

<!-- keyed on the workspace, because the form holds a draft of the name it opened on. -->
{#if workspace.editing}
	{#key workspace.editing.workspace.id}
		<WorkspaceRenameForm
			workspace={workspace.editing.workspace}
			open={workspace.editing !== null}
			onOpenChange={(value) => {
				if (!value) organizationHostState.workspace.editing = null;
			}}
		/>
	{/key}
{/if}

<AccessDialog
	open={workspace.changingAccess !== null}
	onOpenChange={(value) => {
		if (!value && !changeAccess.isPending) organizationHostState.workspace.changingAccess = null;
	}}
	title={$LL.organization.dashboard.workspaceAccessTitle()}
	description={$LL.organization.dashboard.workspaceAccessDescription({
		workspace: workspace.changingAccess?.workspace.name ?? ''
	})}
	rows={workspaceRows}
	isSaving={changeAccess.isPending}
	onSave={(changes) => void changeWorkspaceAccess(changes)}
/>

<!-- the packaged confirm, which names what is lost before it offers anything destructive
     ([[rules/interface]], *Form surface*). Deleting a workspace deletes its database on Turso, and
     nothing anywhere puts it back. -->
<DeleteDialog
	open={workspace.deleting !== null}
	onOpenChange={(value) => {
		if (!value) organizationHostState.workspace.deleting = null;
	}}
	onSubmit={confirmDelete}
	record={workspace.deleting?.workspace.name ?? ''}
	title={$LL.organization.dashboard.deleteWorkspace()}
	description={$LL.organization.dashboard.deleteWorkspaceDescription()}
	confirmLabel={$LL.organization.dashboard.deleteWorkspace()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
