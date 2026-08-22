<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import { showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import type { ImportRejection } from '$lib/design/import';
	import {
		countTransfer,
		isWorkspaceImportable,
		planWorkspaceImport,
		type TransferConcept,
		type WorkspacePlan,
		type WorkspaceSheetPlan,
		type WorkspaceTransfer
	} from '$lib/workspace/workspace';
	import CirclePlusIcon from '@lucide/svelte/icons/circle-plus';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import CopyXIcon from '@lucide/svelte/icons/copy-x';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import UnlinkIcon from '@lucide/svelte/icons/unlink';
	import api from '$lib/api/caller';

	/**
	 * Reading a whole workspace out of one file: choose it, see what each sheet would do, agree.
	 *
	 * **A line per sheet**, which is what a workspace file needs and a directory's does not: five
	 * tables under one figure would hide which of them is empty. A directory reads one concept and
	 * has its own dialog for it — `directory-import-dialog.svelte` — because a panel repeating a
	 * concept's name back at a reader standing on that concept's list is this shape worn by
	 * something that has one row in it.
	 *
	 * The two also differ in what a reference nothing answers to costs. Here it refuses the whole
	 * file: the row it named is what another row exists for, and writing the half that resolved
	 * would build a workspace the file never described. In a file of one concept nothing can
	 * depend on the dropped row, so the row is turned away and the rest still goes in.
	 */
	let {
		open = $bindable(false),
		onConfirm
	}: {
		open?: boolean;
		/** write the workspace the reader agreed to. */
		onConfirm: (transfer: WorkspaceTransfer) => Promise<void>;
	} = $props();

	let isReading = $state(false);
	let isWriting = $state(false);
	let plan = $state<WorkspacePlan | null>(null);
	let fileName = $state('');

	// the file is at fault rather than any row in it: a sheet with no column to tell its rows
	// apart, two rows claiming one record, or — across several sheets — a row naming something
	// nothing answers to. Nothing in it can be read, so what each sheet would have done is moot.
	//
	// A sheet merely missing a column a record is *built* from is not one of these. It can still
	// say which records it is about, which is what a directory's own export coming back is, and
	// the summary below is exactly what that reader needs to see.
	const isFileRefused = $derived(
		plan !== null &&
			(plan.refusedWhole ||
				plan.sheets.some((sheet) => sheet.unreadable || sheet.collisions.length > 0))
	);
	const offersImport = $derived(plan !== null && isWorkspaceImportable(plan));
	const canConfirm = $derived(offersImport && !isWriting);
	// the concepts worth a line: one the file carried, or one it did not and should have. A file
	// of tenants alone is a legitimate workspace file, so an absent sheet is not an error — it is
	// simply not shown.
	const shown = $derived(plan?.sheets.filter((sheet) => sheet.present) ?? []);

	// how many turned-away rows are worth naming individually. Past a handful the list stops
	// being a thing to act on and becomes the reason repeated, which the count above it already
	// said once.
	const NAMED_ROWS = 4;

	function toConceptName(concept: TransferConcept) {
		return $LL.common.nav[concept]();
	}

	// the reasons a row is turned away, in the order they are worth reading: what is already here
	// first, because on a file that has been imported once it is all of them, then the two a
	// reader can actually go and fix.
	const SKIP_REASONS = [
		'duplicate-of-existing',
		'missing-value',
		'invalid',
		'missing-column'
	] as const satisfies readonly ImportRejection['reason'][];

	/** Why a sheet's rows were turned away, counted by reason rather than listed. */
	function toSkips(sheet: WorkspaceSheetPlan) {
		return SKIP_REASONS.map((reason) => ({
			reason,
			count: sheet.rejected.filter((rejection) => rejection.reason === reason).length
		})).filter((skip) => skip.count > 0);
	}

	function toSkipLabel(skip: { reason: ImportRejection['reason']; count: number }) {
		switch (skip.reason) {
			case 'duplicate-of-existing':
				return $LL.common.import.skippedHeld({ count: skip.count });
			case 'missing-value':
				return $LL.common.import.skippedIncomplete({ count: skip.count });
			default:
				return $LL.common.import.skippedUnreadable({ count: skip.count });
		}
	}

	/**
	 * The turned-away rows a reader could do something about.
	 *
	 * A row already here is not one of them: there is nothing to go and fix, and against a
	 * workspace that has been imported once already it is every row in the file. A row that could
	 * not be read is the opposite — the line number is the whole point of telling them.
	 */
	function toNameable(sheet: WorkspaceSheetPlan) {
		return sheet.rejected.filter((rejection) => rejection.reason !== 'duplicate-of-existing');
	}

	function toNamedRows(sheet: WorkspaceSheetPlan) {
		return toNameable(sheet).slice(0, NAMED_ROWS);
	}

	/** Why one row was turned away, in the reader's language. */
	function toReason(rejection: ImportRejection) {
		switch (rejection.reason) {
			case 'duplicate-of-existing':
				return $LL.common.import.reasons.duplicateOfExisting({ detail: rejection.detail });
			case 'missing-value':
				return $LL.common.import.reasons.missingValue({ detail: rejection.detail });
			default:
				// what a concept refuses a row for is the value it could not read, not a sentence: the
				// declaration is one for both languages and cannot compose one. The sentence is here.
				return $LL.common.import.reasons.invalid({ detail: rejection.detail });
		}
	}

	/** Ask for a file, read every sheet of it, and work out what it would do — writing nothing. */
	export async function choose() {
		if (isReading) {
			return;
		}

		isReading = true;

		try {
			const path = await tauri.dialog.openFile();

			if (!path) {
				return;
			}

			const tables = await tauri.import.readBook(path);
			// what the workspace already holds, read once for the whole file: a row that duplicates
			// a record is turned away here rather than at the write, and a reference may resolve
			// against a record that is already here as readily as against one the file creates.
			const held = await api.workspace.held();

			fileName = path.split(/[\\/]/).pop() ?? path;
			plan = planWorkspaceImport(tables, Date.now(), held);
			open = true;
		} catch (failure) {
			showErrorToast(failure, $LL);
		} finally {
			isReading = false;
		}
	}

	async function confirm() {
		if (!plan || !canConfirm) {
			return;
		}

		isWriting = true;

		try {
			await onConfirm(plan.transfer);
			open = false;
			plan = null;
		} catch (failure) {
			// the write is one batch, so a refusal here created nothing — the workspace is exactly
			// as it was and the reader can fix the file and come back.
			showErrorToast(failure, $LL);
		} finally {
			isWriting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{$LL.settings.transferImportTitle()}</Dialog.Title>
			<Dialog.Description class="flex items-center gap-2">
				<FileSpreadsheetIcon class="size-3.5 shrink-0" />
				<span class="min-w-0 truncate">{fileName}</span>
			</Dialog.Description>
		</Dialog.Header>

		<!-- one scroll area, and the dialog's own. The directory's version stacked a panel per
		     concept with every turned-away row listed under it, and against a real workspace that
		     came to five thousand lines: the dialog outgrew the window, its header went off the top,
		     and the wheel scrolled whichever inner list the pointer happened to be over. A body that
		     scrolls as one, holding a summary rather than a transcript, is what fixes both. -->
		<div class="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
			{#if plan}
				<!-- a column absent, said two ways because it costs two different things. Where the
				     column is one a row is identified by, the file cannot be read and that is the
				     whole answer. Where it is one a record is only *built* from, the file can still
				     say which records it is about — which is what a directory's own export is coming
				     back — so it is a caution over a summary rather than a refusal instead of one. -->
				{#each plan.sheets.filter((sheet) => sheet.missingColumns.length > 0) as sheet (sheet.concept)}
					<Callout tone={sheet.unreadable ? 'error' : 'warning'} class="flex items-start gap-3">
						<Columns3Icon class="mt-0.5 size-4 shrink-0" />
						<span class="min-w-0">
							{sheet.unreadable
								? $LL.common.import.sheetMissingColumns({
										sheet: toConceptName(sheet.concept),
										columns: sheet.missingColumns.join(', ')
									})
								: $LL.common.import.sheetIncompleteColumns({
										sheet: toConceptName(sheet.concept),
										columns: sheet.missingColumns.join(', ')
									})}
						</span>
					</Callout>
				{/each}

				<!-- capped for the same reason the rows below are: a file that repeats one record
				     usually repeats a hundred, and a hundred identical callouts is a wall rather than
				     a finding. The first few name the rows to go and look at; the count says how far
				     the problem runs. -->
				{#each plan.sheets as sheet (sheet.concept)}
					{#each sheet.collisions.slice(0, NAMED_ROWS) as collision (collision.identity)}
						<Callout tone="error" class="flex items-start gap-3">
							<CopyXIcon class="mt-0.5 size-4 shrink-0" />
							<span class="min-w-0">
								{$LL.common.import.sheetCollision({
									sheet: toConceptName(sheet.concept),
									rows: collision.rows.join(', '),
									identity: collision.identity
								})}
							</span>
						</Callout>
					{/each}

					{#if sheet.collisions.length > NAMED_ROWS}
						<p class="text-xs text-muted-foreground">
							{$LL.common.import.more({ count: sheet.collisions.length - NAMED_ROWS })}
						</p>
					{/if}
				{/each}

				{#if plan.unresolved.length > 0}
					<!-- the criterion: a reference nothing answers to names its sheet and its row, and the
					     file is refused whole before anything is written — these sheets depend on each
					     other, and a workspace assembled out of the half that resolved is one the file never
					     described. Only the first few rows are listed: one broken reference is usually a
					     hundred, and a dialog that scrolls for a page says no more than one that names the
					     first of them. -->
					<Callout tone="error" class="flex flex-col gap-2">
						<span class="flex items-start gap-3">
							<UnlinkIcon class="mt-0.5 size-4 shrink-0" />
							<span class="min-w-0">
								{$LL.common.import.unresolvedRefused({ count: plan.unresolved.length })}
							</span>
						</span>
						<ul class="flex flex-col gap-1 ps-7 text-xs">
							{#each plan.unresolved.slice(0, NAMED_ROWS) as reference (`${reference.concept}-${reference.row}-${reference.reference}`)}
								<li>
									{$LL.common.import.unresolvedRow({
										sheet: toConceptName(reference.concept),
										row: reference.row,
										reference: reference.reference
									})}
								</li>
							{/each}
							{#if plan.unresolved.length > NAMED_ROWS}
								<li>{$LL.common.import.more({ count: plan.unresolved.length - NAMED_ROWS })}</li>
							{/if}
						</ul>
					</Callout>
				{/if}

				{#if !isFileRefused}
					<!-- one line per sheet, and a line is a line: the concept, what it would create, and
					     under it what it would leave behind — as a count per reason rather than as the
					     rows themselves. A workspace file turns away thousands of rows for one reason,
					     and five thousand lines each saying the same sentence tell a reader less than
					     one line saying it once with a number on it. -->
					<div class="flex flex-col rounded-2xl bg-muted">
						{#each shown as sheet, index (sheet.concept)}
							{@const named = toNamedRows(sheet)}
							<div
								class="flex flex-col gap-2 p-4 {index > 0 ? 'border-t border-background/60' : ''}"
							>
								<div class="flex items-center gap-3">
									<CirclePlusIcon
										class="size-5 shrink-0 {sheet.create > 0
											? 'text-success'
											: 'text-muted-foreground'}"
									/>
									<p class="min-w-0 flex-1 text-sm capitalize">{toConceptName(sheet.concept)}</p>
									<p class="shrink-0 text-sm tabular-nums">
										{$LL.common.import.willCreate({ count: sheet.create })}
									</p>
								</div>

								{#if sheet.rejected.length > 0}
									<!-- the reasons, counted. Aligned under the concept rather than under its
									     glyph, so the eye reads a sheet as one block. -->
									<p
										class="flex flex-wrap items-center gap-x-3 gap-y-1 ps-8 text-xs text-muted-foreground"
									>
										<CircleSlashIcon class="size-3.5 shrink-0" />
										{#each toSkips(sheet) as skip (skip.reason)}
											<span>{toSkipLabel(skip)}</span>
										{/each}
									</p>

									<!-- and the rows worth naming: the ones a reader could act on. A row already
									     here needs no line number — there is nothing to go and fix — so only a
									     malformed or incomplete one is named, and only a few of those. -->
									{#if named.length > 0}
										<ul class="flex flex-col gap-1 ps-8 text-xs text-muted-foreground">
											{#each named as rejection (rejection.row)}
												<li class="flex items-baseline gap-2">
													<span
														class="shrink-0 rounded-md bg-background/60 px-1.5 py-0.5 font-medium tabular-nums"
													>
														{$LL.common.import.rejectedRow({ row: rejection.row })}
													</span>
													<span class="min-w-0">{toReason(rejection)}</span>
												</li>
											{/each}
											{#if toNameable(sheet).length > named.length}
												<li>
													{$LL.common.import.more({
														count: toNameable(sheet).length - named.length
													})}
												</li>
											{/if}
										</ul>
									{/if}
								{/if}
							</div>
						{/each}

						{#if !offersImport}
							<p class="border-t border-background/60 p-4 text-sm text-muted-foreground">
								{countTransfer(plan.transfer) === 0 && shown.length === 0
									? $LL.common.import.noSheets()
									: $LL.common.import.nothingToCreate()}
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<Dialog.Footer>
			<Button
				variant={offersImport ? 'ghost' : 'default'}
				disabled={isWriting}
				onclick={() => (open = false)}
				class="w-full sm:w-auto"
			>
				{offersImport ? $LL.common.actions.cancel() : $LL.common.ui.close()}
			</Button>

			{#if offersImport}
				<Button disabled={!canConfirm} onclick={confirm} class="w-full sm:w-auto">
					{isWriting ? $LL.common.actions.working() : $LL.common.actions.import()}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
