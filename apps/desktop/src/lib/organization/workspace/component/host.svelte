<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { isolateDirection, toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { showErrorToast, showSuccessToast } from '$lib/notification';
	import { IMPORT_FLAGS, refusalOfEvery } from '$lib/permission';
	import { tauri } from '$lib/platform/tauri';
	import { toTransferInput, toWorkbook, transferHost } from '$lib/transfer';
	import { WorkspaceImportDialog } from '$lib/transfer/ui';
	import { useImportRecords } from '$lib/workspace/ui';
	import { useSetWorkspaceOverride, type useChangeAccess } from '$lib/organization/access/query';
	import type { WorkspaceTailoring } from '$lib/organization/access/access';
	import { lacking } from '$lib/organization/role/acts';
	import PermissionsSheet from './permissions-sheet.svelte';
	import type { WorkspaceActRecord } from '$lib/organization/workspace/acts';
	import { back } from '@rentable/design/back.svelte.js';
	import { tick, untrack } from 'svelte';
	import { workspacePageOf, workspacesSection } from '$lib/organization/workspace/address';
	import { useDeleteWorkspace } from '$lib/organization/workspace/query';
	import { organizationHostState } from '$lib/organization/host.svelte';
	import WorkspaceRenameForm from './rename-form.svelte';

	/**
	 * Every surface a workspace act opens: its name, its file, and deleting it. Who holds it is the
	 * workspace's own page (`./page.svelte`, effort 846 ticket 49), which the act navigates to; the
	 * question before a member is taken out of it, asked from a card on that page, is here (ticket
	 * 50), so the page mounts no dialog.
	 * Mounted by the organization host (`../../component/host.svelte`), which resets what is here
	 * as it goes.
	 *
	 * **A workspace's file is written and read here, for whichever card asked** (effort 846,
	 * requirement 15). The export asks where first, then reads the workspace the card names
	 * (`transfer.get`, which reaches one that is not open over Turso and never opens it on this
	 * machine), writes the workbook and reveals it. The import is one dialog for every card,
	 * named for the workspace it reads into, and its confirm writes into that workspace by its id.
	 * *Both sat in a block beneath the directory until then, and moved only the open workspace.*
	 */
	let {
		changeAccess,
		refetchState
	}: {
		/** the access write, read once by the organization host: a removal is a withdrawal. */
		changeAccess: ReturnType<typeof useChangeAccess>;
		/** read where the machine stands again, after a write that moves it. */
		refetchState: () => Promise<unknown>;
	} = $props();

	const workspace = $derived(organizationHostState.workspace);

	const deleteWorkspace = useDeleteWorkspace();

	// ----- the workspaces

	/**
	 * a workspace deleted, once the confirm has asked: the database goes with it, so the session is
	 * read again to drop the row the rail's switcher is still drawing. Its page is not somewhere back
	 * can return to now: a reader standing on it is taken to the workspaces section, and anywhere
	 * else it is only forgotten from behind them, as a complex's page is.
	 */
	const confirmDelete = async () => {
		const opened = workspace.deleting;

		if (!opened) return;

		await deleteWorkspace.mutateAsync({ workspaceId: opened.workspace.id });
		await refetchState();

		const workspacePage = workspacePageOf(opened.workspace.id);

		if (page.url.pathname === workspacePage) {
			back.forgetCurrent();
			await goto(workspacesSection());

			return;
		}

		back.forget(workspacePage);
	};

	// ----- who holds it

	/**
	 * a member taken out of the workspace, once the confirm has asked: one withdrawal through the
	 * access write the page and the member's sheet make. What it was refused with is the shared
	 * handler's to say, and the dialog stays open over it.
	 */
	const confirmRemove = async () => {
		const asked = workspace.removing;

		if (!asked) return;

		await changeAccess.mutateAsync({
			changes: [
				{
					workspaceId: asked.workspace.id,
					memberId: asked.holder.member.id,
					access: 'none'
				}
			]
		});
	};

	// ----- what one member may do there (ticket 51)

	const setWorkspaceOverride = useSetWorkspaceOverride();

	let isSavingPermissions = $state(false);
	/** what the shell refused the last save with, said in the sheet, which stays open over it. */
	let permissionsError = $state<string | null>(null);

	/** what the workspace the sheet is open on holds for the member now. */
	const permissionsHeld = $derived.by((): WorkspaceTailoring => {
		const asked = workspace.permissions;
		const grant = asked?.holder.member.workspaces.find((held) => held.id === asked.workspace.id);

		return {
			access: grant?.access === 'read-only' ? 'read-only' : 'full-access',
			pinned: grant?.pinned ?? 0,
			granted: grant?.granted ?? 0
		};
	});

	/**
	 * why the reader may change nothing in the sheet, as the act was refused: the act is
	 * `overrideMember`'s, and a member ranked at or above the reader is tailored by somebody above.
	 */
	const permissionsRefusal = $derived.by(() => {
		const asked = workspace.permissions;

		if (!asked) return null;
		if (!asked.holder.context.canOverride) return lacking($LL, 'overrideMember');

		return asked.holder.member.rank >= asked.holder.context.rank
			? $LL.organization.dashboard.notBelowYou()
			: null;
	});

	/**
	 * why a grant minted read only could not be lifted to full access by a write turned on, as the
	 * member's card says it: the act, and a workspace the reader holds at full access.
	 */
	const regrantRefusal = $derived.by(() => {
		const asked = workspace.permissions;

		if (!asked) return null;
		if (!asked.holder.context.canGrantWorkspace) return lacking($LL, 'grantWorkspace');

		return asked.workspace.accessLevel === 'full-access'
			? null
			: $LL.organization.workspaceSwitches.notHeld();
	});

	/**
	 * the member's permissions in the workspace, saved through the writes the member's card makes
	 * for one workspace: what is pinned there first, then a grant minted read only lifted to full
	 * access where a write was turned on over it, since the pins are what keep its other writes off.
	 * Nothing changed closes the sheet and writes nothing.
	 */
	const savePermissions = async (next: WorkspaceTailoring) => {
		const asked = workspace.permissions;

		if (!asked || permissionsRefusal !== null) return;

		const held = permissionsHeld;
		const memberId = asked.holder.member.id;
		const workspaceId = asked.workspace.id;

		isSavingPermissions = true;
		permissionsError = null;

		try {
			if (next.pinned !== held.pinned || next.granted !== held.granted) {
				await setWorkspaceOverride.mutateAsync({
					memberId,
					workspaceId,
					pinned: next.pinned,
					granted: next.granted
				});
			}

			if (next.access === 'full-access' && held.access === 'read-only') {
				await changeAccess.mutateAsync({
					changes: [{ workspaceId, memberId, access: 'full-access' }]
				});
			}

			organizationHostState.workspace.permissions = null;
		} catch (error) {
			permissionsError = toErrorText(error, $LL);
		} finally {
			isSavingPermissions = false;
		}
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

<!-- taking a member out of a workspace ends their access there once what they hold runs out, so it
     asks first under its own verb, naming the member, what ends and what gives it back. -->
<ConfirmDialog
	open={workspace.removing !== null}
	onOpenChange={(value) => {
		if (!value) organizationHostState.workspace.removing = null;
	}}
	onSubmit={confirmRemove}
	record={workspace.removing?.holder.member.username}
	title={$LL.organization.workspacePage.removeFromWorkspace()}
	description={$LL.organization.workspacePage.removeAsks()}
	confirmLabel={$LL.organization.workspacePage.removeFromWorkspace()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>

<!-- what one member may do in the workspace, and nothing else, keyed on the member and the
     workspace because the sheet holds what its switches come to. -->
{#if workspace.permissions}
	{@const asked = workspace.permissions}
	{#key `${asked.workspace.id}:${asked.holder.member.id}`}
		<PermissionsSheet
			open
			onOpenChange={(value) => {
				if (!value && !isSavingPermissions) {
					organizationHostState.workspace.permissions = null;
					permissionsError = null;
				}
			}}
			username={asked.holder.member.username}
			workspaceId={asked.workspace.id}
			workspaceName={asked.workspace.name}
			organizationWide={asked.holder.member.permissions}
			held={permissionsHeld}
			readerPermissions={asked.holder.context.permissions}
			refusal={permissionsRefusal}
			{regrantRefusal}
			isSaving={isSavingPermissions}
			error={permissionsError}
			onSave={(next) => void savePermissions(next)}
		/>
	{/key}
{/if}

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
