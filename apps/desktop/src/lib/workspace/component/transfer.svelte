<script lang="ts">
	import api from '$lib/api/caller';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { toExportSheet } from '$lib/design/csv';
	import { isolateDirection } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import WorkspaceImportDialog from '$lib/workspace/component/import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import {
		TRANSFER_COLUMNS,
		TRANSFER_CONCEPTS,
		toSheetTitle,
		toTransferInput,
		type WorkspaceTransfer
	} from '$lib/workspace/workspace';
	import { toast } from 'svelte-sonner';

	/**
	 * A whole workspace, out as one file and back in from one.
	 *
	 * It sits in the settings screen's workspace group rather than on any directory's toolbar,
	 * beside the backup and sync controls that are the other two answers to *where does this
	 * workspace live*. A directory's toolbar is the wrong place by construction: a workspace is
	 * not a list, and a control on the tenants screen that quietly wrote every contract and
	 * payment as well would be lying about its scope.
	 */

	/** the one format a workspace can be, because it is the only one that holds five tables. */
	const WORKSPACE_FILE = 'workspace.xlsx';

	let isExporting = $state(false);
	let importDialog = $state<ReturnType<typeof WorkspaceImportDialog> | undefined>(undefined);

	const importMutation = useImportRecords();

	/** Every sheet of the file, in the order the reader has to read them back in. */
	function toSheets(transfer: WorkspaceTransfer) {
		return TRANSFER_CONCEPTS.map((concept) =>
			// the cast is what a per-concept table costs in one expression: each concept's columns
			// read its own records and the loop is over five different pairs, which no single
			// signature describes. The pairing itself is checked where the columns are declared.
			toExportSheet(
				TRANSFER_COLUMNS[concept] as never,
				transfer[concept] as never[],
				toSheetTitle(concept)
			)
		);
	}

	async function exportWorkspace() {
		if (isExporting) {
			return;
		}

		isExporting = true;

		try {
			// read now rather than from a cache: the file is what the workspace is at the moment
			// the reader asked for it, and nothing on this screen was showing any of it.
			const transfer = await api.workspace.get();
			const path = await tauri.export.writeWorkbook(WORKSPACE_FILE, toSheets(transfer));

			toast.success($LL.common.messages.exported({ path: isolateDirection(path) }));

			// a file manager that will not open is not a failed export: the file is written and the
			// reader has been told where.
			await tauri.opener.revealItemInDir(path).catch(() => {});
		} catch (failure) {
			showErrorToast(failure, $LL);
		} finally {
			isExporting = false;
		}
	}
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Title>{$LL.settings.transferTitle()}</Field.Title>
		<Field.Description>{$LL.settings.transferDescription()}</Field.Description>
	</Field.Content>

	<!-- two controls rather than a menu: this is not a list's toolbar with four icons competing
	     for one corner, and the two directions are the whole of what the row offers. -->
	<div class="flex shrink-0 items-center gap-2">
		<Button variant="outline" size="sm" disabled={isExporting} onclick={exportWorkspace}>
			{isExporting ? $LL.common.actions.working() : $LL.common.actions.export()}
		</Button>
		<Button variant="outline" size="sm" onclick={() => void importDialog?.choose()}>
			{$LL.common.actions.import()}
		</Button>
	</div>
</Field.Field>

<WorkspaceImportDialog
	bind:this={importDialog}
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
