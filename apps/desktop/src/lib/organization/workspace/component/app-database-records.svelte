<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { isolateDirection } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { WorkspaceImportDialog } from '$lib/transfer/ui';
	import { IMPORT_FLAGS, memberPermissions } from '$lib/permission';
	import {
		readEarlierRecords,
		useEarlierRecords,
		useImportRecords,
		useSettleEarlierRecords
	} from '$lib/workspace/ui';
	import { toTransferInput } from '$lib/transfer';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';

	/**
	 * The records 0.12.0 or 0.13.0 left on this machine, offered for the workspace open here
	 * (effort 838, requirement 18).
	 *
	 * **A callout above the workspace cards, naming the workspace it fills** (effort 846,
	 * requirement 17). Bringing them in is the workspace import over a file this build wrote from
	 * `app.db`, so it opens the same dialog, named for that workspace, and writes into it by its
	 * id: the plan is shown, sheet by sheet, before anything is written. With nothing open there is
	 * nowhere to bring them, so the callout says to open one and offers no act. A notice standing
	 * on a surface is a callout ([[rules/interface]], *Feedback*), and it is `info`, since nothing
	 * is wrong. *It sat above the transfer row beneath the cards until the workspace's file moved
	 * onto its card.*
	 *
	 * **It names the workbook it keeps.** Reading the records writes them as the export's workbook
	 * beside this machine's other copies, which is the copy the person keeps whatever they decide
	 * in the dialog. Until it is read the name is the one it will have under `backups/app/`, where
	 * `tauri/src/upgrade/record.rs` writes it; once read, the path it was written to.
	 *
	 * **Two acts, and each ends the offer.** Brought in, or dismissed, it goes and stays gone on
	 * this machine: the settings file records it, so the way in stops saying so too. Walking away
	 * from the dialog is neither, and the offer stays. The bring in needs the import's flags, and
	 * without them it is refused at the control, saying why, as the transfer's own import is
	 * ([[rules/interface]], *Guidance*).
	 */

	let {
		workspace
	}: {
		/** the workspace open on this machine, which the records are brought into, or none. */
		workspace: { id: string; name: string } | null;
	} = $props();

	const earlier = useEarlierRecords();
	const importMutation = useImportRecords();
	const settle = useSettleEarlierRecords();

	let importDialog = $state<ReturnType<typeof WorkspaceImportDialog> | undefined>(undefined);
	/** the path the workbook was written to, once the records have been read. */
	let written = $state<string | null>(null);

	const offered = $derived(earlier.offered);
	const workbook = $derived(
		written ?? (offered ? `backups/app/workspace-${offered.version}.xlsx` : '')
	);
	const unavailable = $derived(memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL));
	const reasonId = $props.id();

	async function bringIn() {
		if (unavailable || !workspace) return;

		await importDialog?.review(async () => {
			const read = await readEarlierRecords();

			written = read.path;

			return read;
		});
	}

	function dismiss() {
		if (settle.isPending) return;

		settle.mutate();
	}
</script>

{#if offered}
	<Callout tone="info" class="flex flex-col gap-3" data-earlier-records={offered.version}>
		<div class="flex items-start gap-3">
			<ArchiveRestoreIcon class="mt-1 size-4 shrink-0" />
			<div class="min-w-0 space-y-1">
				<p class="font-medium first-letter:uppercase">
					{$LL.earlier.title({ version: offered.version })}
				</p>
				<p data-earlier-description>
					{workspace
						? $LL.earlier.description({ workspace: isolateDirection(workspace.name) })
						: $LL.earlier.openOne()}
				</p>
				<p class="text-xs">
					{$LL.earlier.kept()}
					<!-- a machine string, read left to right in both locales
					     ([[rules/frontend]], *i18n*). -->
					<span dir="ltr" class="break-all" data-earlier-workbook>{workbook}</span>
				</p>
			</div>
		</div>

		<!-- the way on at the trailing end, and putting it aside before it, quieter. Neither where
		     nothing is open: the line above says what comes first. -->
		{#if workspace}
			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button
					variant="ghost"
					size="sm"
					disabled={settle.isPending}
					onclick={dismiss}
					data-earlier-dismiss
				>
					{$LL.earlier.dismiss()}
				</Button>

				<Tooltip.Root disabled={!unavailable}>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="sm"
								class={unavailable ? unavailableControl : undefined}
								data-unavailable={unavailable ? '' : undefined}
								aria-disabled={unavailable ? 'true' : undefined}
								aria-describedby={unavailable ? reasonId : undefined}
								onclick={() => void bringIn()}
								data-earlier-bring-in
							>
								{$LL.earlier.bringIn()}
								{#if unavailable}
									<span id={reasonId} class="sr-only">{unavailable}</span>
								{/if}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						<span data-unavailable-reason>{unavailable}</span>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		{/if}
	</Callout>
{/if}

<WorkspaceImportDialog
	bind:this={importDialog}
	{workspace}
	refusal={unavailable}
	onConfirm={async (transfer, workspaceId) => {
		await importMutation.mutateAsync({ ...toTransferInput(transfer), workspaceId });
		// brought in: the offer is done. A write that fails after the records went in is said by
		// the shared handler, and the offer stays until it is dismissed.
		settle.mutate();
	}}
/>
