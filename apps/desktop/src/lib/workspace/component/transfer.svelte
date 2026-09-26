<script lang="ts">
	import api from '$lib/api/caller';
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { toExportSheet } from '@rentable/design/csv.js';
	import { isolateDirection } from '$lib/error/message';
	import { showErrorToast, showSuccessToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import WorkspaceImportDialog from '$lib/workspace/component/import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { EXPORT_FLAGS, IMPORT_FLAGS, memberPermissions } from '$lib/workspace/permission';
	import {
		TRANSFER_COLUMNS,
		TRANSFER_CONCEPTS,
		toSheetTitle,
		toTransferInput,
		type WorkspaceTransfer
	} from '$lib/workspace/workspace';

	/**
	 * A whole workspace, out as one file and back in from one.
	 *
	 * It sits in the settings screen's workspace group rather than on any directory's toolbar,
	 * beside the sync controls that are the other answer to *where does this workspace live*.
	 * A directory's toolbar is the wrong place by construction: a workspace is
	 * not a list, and a control on the tenants screen that quietly wrote every contract and
	 * payment as well would be lying about its scope.
	 */

	/** the one format a workspace can be, because it is the only one that holds five tables. */
	const WORKSPACE_FILE = 'workspace.xlsx';

	let isExporting = $state(false);
	let importDialog = $state<ReturnType<typeof WorkspaceImportDialog> | undefined>(undefined);

	const importMutation = useImportRecords();

	// why the reader may not bring a file in here, or nothing where they may: every kind's create,
	// as the procedure asks, since a workspace file holds every kind (effort 838, requirement 10).
	const importUnavailable = $derived(memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL));
	// and why the reader may not take the workspace out, naming the first view flag they lack: the
	// file holds every kind, so `workspace.get` asks for every kind's view.
	const exportUnavailable = $derived(memberPermissions.refusalOfEvery(EXPORT_FLAGS, $LL));
	// one id for the row, and one reason under it per control.
	const reasonId = $props.id();
	const importReasonId = `${reasonId}-import`;
	const exportReasonId = `${reasonId}-export`;

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
		if (isExporting || exportUnavailable) {
			return;
		}

		isExporting = true;

		try {
			// asked before the workspace is read: a reader who walked away from the dialog has not
			// asked for anything, and reading five tables to throw them away is work nobody wanted.
			const chosen = await tauri.dialog.saveFile(WORKSPACE_FILE);

			if (!chosen) {
				return;
			}

			// read now rather than from a cache: the file is what the workspace is at the moment
			// the reader asked for it, and nothing on this screen was showing any of it.
			const transfer = await api.workspace.get();
			const path = await tauri.export.writeWorkbook(chosen, toSheets(transfer));

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
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<!-- no title of its own: the group above is already named for what this row does, and a row
		     title repeating its own section is the label the section had already given it. Both read
		     "move this workspace" until 2026-08-21, one directly above the other. -->
		<Field.Description>{$LL.workspace.transferDescription()}</Field.Description>
	</Field.Content>

	<!-- two controls rather than a menu: this is not a list's toolbar with four icons competing
	     for one corner, and the two directions are the whole of what the row offers. -->
	<div class="flex shrink-0 items-center gap-2">
		<!-- refused rather than taken away where the reader may not view every kind, and saying which
		     flag they lack, as the import beside it does. -->
		<Tooltip.Root disabled={!exportUnavailable}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="sm"
						disabled={isExporting}
						class={exportUnavailable ? unavailableControl : undefined}
						data-unavailable={exportUnavailable ? '' : undefined}
						aria-disabled={exportUnavailable ? 'true' : undefined}
						aria-describedby={exportUnavailable ? exportReasonId : undefined}
						onclick={exportWorkspace}
					>
						{isExporting ? $LL.common.actions.working() : $LL.common.actions.export()}
						{#if exportUnavailable}
							<span id={exportReasonId} class="sr-only">{exportUnavailable}</span>
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				<span data-unavailable-reason>{exportUnavailable}</span>
			</Tooltip.Content>
		</Tooltip.Root>
		<!-- refused rather than taken away where the reader may not import, and saying why on hover
		     and focus, as a list's import does ([[rules/interface]], *Guidance*). -->
		<Tooltip.Root disabled={!importUnavailable}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="sm"
						class={importUnavailable ? unavailableControl : undefined}
						data-unavailable={importUnavailable ? '' : undefined}
						aria-disabled={importUnavailable ? 'true' : undefined}
						aria-describedby={importUnavailable ? importReasonId : undefined}
						onclick={() => {
							if (!importUnavailable) {
								void importDialog?.choose();
							}
						}}
					>
						{$LL.common.actions.import()}
						{#if importUnavailable}
							<span id={importReasonId} class="sr-only">{importUnavailable}</span>
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				<span data-unavailable-reason>{importUnavailable}</span>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
</Field.Field>

<WorkspaceImportDialog
	bind:this={importDialog}
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
