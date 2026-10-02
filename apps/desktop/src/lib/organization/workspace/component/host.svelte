<script lang="ts">
	import api from '$lib/api/caller';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { isolateDirection } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { showErrorToast, showSuccessToast } from '$lib/notification';
	import { IMPORT_FLAGS, refusalOfEvery } from '$lib/permission';
	import { tauri } from '$lib/platform/tauri';
	import { toTransferInput, toWorkbook, transferHost } from '$lib/transfer';
	import { WorkspaceImportDialog } from '$lib/transfer/ui';
	import { useImportRecords } from '$lib/workspace/ui';
	import type { WorkspaceActRecord } from '$lib/organization/workspace/acts';
	import { tick, untrack } from 'svelte';
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
	 * Every surface a workspace act opens: its name, who holds it, its file, and deleting it.
	 * Mounted by the organization host (`../../component/host.svelte`), which reads the session and
	 * the members once for every part of it and resets what is here as it goes.
	 *
	 * **A workspace's file is written and read here, for whichever card asked** (effort 846,
	 * requirement 15). The export asks where first, then reads the workspace the card names
	 * (`transfer.get`, which reaches one that is not open over Turso and never opens it on this
	 * machine), writes the workbook and reveals it. The import is one dialog for every card,
	 * named for the workspace it reads into, and its confirm writes into that workspace by its id.
	 * *Both sat in a block beneath the directory until then, and moved only the open workspace.*
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

	// ----- the file

	/** the one format a workspace can be, because it is the only one that holds five tables. */
	const WORKSPACE_FILE = 'workspace.xlsx';

	let isExporting = $state(false);

	/**
	 * a workspace written to a file the reader chooses. One at a time: a second press while the
	 * first is asking where, or reading, asks for nothing.
	 */
	async function exportWorkspace(record: WorkspaceActRecord) {
		if (isExporting) return;

		isExporting = true;

		try {
			// asked before the workspace is read: a reader who walked away from the dialog has not
			// asked for anything, and reading five tables to throw them away is work nobody wanted.
			const chosen = await tauri.dialog.saveFile(WORKSPACE_FILE);

			if (!chosen) return;

			// read now rather than from a cache, and before anything is written: a workspace that is
			// not open and cannot be reached refuses here, with the sentence naming it, and the file
			// the reader chose is never made.
			const transfer = await api.transfer.get({ workspaceId: record.workspace.id });
			const path = await transferHost.export.writeWorkbook(chosen, toWorkbook(transfer));

			showSuccessToast($LL.common.messages.exported({ path: isolateDirection(path) }));

			// a file manager that will not open is not a failed export: the file is written and the
			// reader has been told where.
			await tauri.opener.revealItemInDir(path).catch(() => {});
		} catch (failure) {
			showErrorToast(failure, $LL);
		} finally {
			isExporting = false;
		}
	}

	// asked for on the press and run here, once: the request is taken off the state before the
	// export starts, so nothing it reads becomes something this effect depends on.
	$effect(() => {
		const asked = workspace.exporting;

		if (!asked) return;

		organizationHostState.workspace.exporting = null;
		untrack(() => void exportWorkspace(asked));
	});

	const importMutation = useImportRecords();

	let importDialog = $state<ReturnType<typeof WorkspaceImportDialog> | undefined>(undefined);
	/** the workspace the import dialog reads into, held while it is open. */
	let importingInto = $state<WorkspaceActRecord | null>(null);

	// why the reader may not import into that workspace, by their standing there, as its card
	// refused it; the procedure asks again.
	const importRefusal = $derived(
		importingInto
			? refusalOfEvery(
					IMPORT_FLAGS,
					importingInto.context.standingOf(importingInto.workspace.id),
					$LL
				)
			: undefined
	);

	// the import asked for on a card: the dialog is named for that workspace first, then asks for
	// the file.
	$effect(() => {
		const asked = workspace.importing;

		if (!asked) return;

		organizationHostState.workspace.importing = null;
		untrack(() => {
			importingInto = asked;
			void tick().then(() => importDialog?.choose());
		});
	});
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

<!-- one import for every card, named for the workspace it reads into, and writing into that one
     by the id its confirm hands back. -->
<WorkspaceImportDialog
	bind:this={importDialog}
	workspace={importingInto?.workspace ?? null}
	refusal={importRefusal}
	onConfirm={async (transfer, workspaceId) => {
		await importMutation.mutateAsync({ ...toTransferInput(transfer), workspaceId });
	}}
/>
