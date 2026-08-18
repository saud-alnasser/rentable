<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import type { ImportRejection } from '$lib/design/import';
	import { showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import {
		isWorkspaceImportable,
		planWorkspaceImport,
		type TransferConcept,
		type WorkspacePlan,
		type WorkspaceTransfer
	} from '$lib/workspace/workspace';
	import CirclePlusIcon from '@lucide/svelte/icons/circle-plus';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import CopyXIcon from '@lucide/svelte/icons/copy-x';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import api from '$lib/api/caller';

	/**
	 * Reading a file into one directory: choose it, see what it would do, then agree to it.
	 *
	 * **Nothing is written until the last step.** The reader is shown what would be created and
	 * what would be turned away, with a reason for each, and the write only happens if they say
	 * so — which is the whole difference between an import and a file that silently rewrites a
	 * workspace.
	 *
	 * **One concept, and the concept is never named here.** The screen this opens over is a list
	 * of exactly those records and the title says which; a panel repeating it under a heading
	 * would be the workspace preview's five-sheet shape worn by something that has one. What a
	 * directory's reader wants is the three answers underneath: how many go in, how many do not
	 * and why, and which rows to go and look at.
	 *
	 * **Rows are named only where naming them helps.** A row already here has no line number worth
	 * visiting — and on a file this directory exported itself, that is every row in it. A row that
	 * could not be read, or that names something the workspace does not hold, is the opposite: the
	 * line number is the whole point of telling them.
	 *
	 * Where the file itself is at fault there is no import control at all, the way the delete
	 * dialog drops its destructive control when something blocks it: the answer is that this file
	 * cannot be read, not that reading it might fail. A file that contradicts itself is one such
	 * fault — two rows claiming one record are both the reader's, choosing between them is not
	 * something this can do quietly, and a batch cannot branch on its own results anyway.
	 */
	let {
		open = $bindable(false),
		title,
		concept,
		onConfirm
	}: {
		open?: boolean;
		/** what the dialog is called, in the concept's own words. */
		title: string;
		/**
		 * which records this file is being read as.
		 *
		 * The surface's answer rather than the file's: a single-sheet file's tab is named by
		 * whatever wrote it — `Sheet1` from a workbook, the file's own name from a delimited file —
		 * and neither says what the rows are. The directory the reader opened it from does.
		 */
		concept: TransferConcept;
		/** write the records the reader agreed to. */
		onConfirm: (transfer: WorkspaceTransfer) => Promise<void>;
	} = $props();

	// how many turned-away rows are worth naming individually. Past a handful the list stops being
	// a thing to act on and becomes the reason repeated, which the count above it already said
	// once — against a directory of five thousand records it is five thousand identical lines.
	const NAMED_ROWS = 4;

	// the reasons a row is turned away, in the order they are worth reading: what is already here
	// first, because on a file this directory exported it is all of them, then the ones a reader
	// can actually go and fix.
	const SKIP_REASONS = [
		'duplicate-of-existing',
		'missing-value',
		'invalid',
		'missing-column'
	] as const satisfies readonly ImportRejection['reason'][];

	let isReading = $state(false);
	let isWriting = $state(false);
	let plan = $state<WorkspacePlan | null>(null);
	let fileName = $state('');

	const sheet = $derived(plan?.sheets.find((held) => held.concept === concept));
	// the file is at fault rather than any row in it: no column to tell its rows apart, or two of
	// its own rows claiming one record. Nothing in it can be read, so what it would have done is
	// moot — showing it would suggest a partial outcome that cannot happen.
	//
	// A file merely missing a column a record is *built* from is not one of these. It can still
	// say which records it is about, which is what this directory's own export is coming back, and
	// the summary is exactly what that reader needs to see.
	const isFileRefused = $derived(
		sheet !== undefined && (sheet.unreadable || sheet.collisions.length > 0)
	);
	const offersImport = $derived(plan !== null && isWorkspaceImportable(plan));
	const canConfirm = $derived(offersImport && !isWriting);

	/** Why rows were turned away, counted by reason rather than listed one by one. */
	const skips = $derived.by(() => {
		if (!sheet || !plan) {
			return [];
		}

		return [
			...SKIP_REASONS.map((reason) => ({
				reason,
				count: sheet.rejected.filter((rejection) => rejection.reason === reason).length
			})),
			// a row naming a record the workspace does not hold is turned away like any other bad
			// row: this file holds one concept, so nothing in it could have depended on that row.
			{ reason: 'unresolved' as const, count: plan.unresolved.length }
		].filter((skip) => skip.count > 0);
	});

	/** The turned-away rows a reader could do something about, in the file's own order. */
	const nameable = $derived.by(() => {
		if (!sheet || !plan) {
			return [];
		}

		return [
			...sheet.rejected
				.filter((rejection) => rejection.reason !== 'duplicate-of-existing')
				.map((rejection) => ({ row: rejection.row, reason: toReason(rejection) })),
			...plan.unresolved.map((reference) => ({
				row: reference.row,
				reason: $LL.common.import.reasons.unresolved({ detail: reference.reference })
			}))
		].sort((first, second) => first.row - second.row);
	});

	function toSkipLabel(skip: { reason: ImportRejection['reason'] | 'unresolved'; count: number }) {
		switch (skip.reason) {
			case 'duplicate-of-existing':
				return $LL.common.import.skippedHeld({ count: skip.count });
			case 'missing-value':
				return $LL.common.import.skippedIncomplete({ count: skip.count });
			case 'unresolved':
				return $LL.common.import.skippedUnresolved({ count: skip.count });
			default:
				return $LL.common.import.skippedUnreadable({ count: skip.count });
		}
	}

	/**
	 * Why one row was turned away, in the reader's language.
	 *
	 * A row the concept itself refused already carries the concept's own sentence and is passed
	 * through; the two this decides are the pass's own findings, and it names them rather than
	 * leaving a bare column sitting beside a row number.
	 */
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

	/** Ask for a file, read it, and work out what it would do — writing nothing. */
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

			// every sheet, so a file that names its concept is matched by that name and a file of
			// one table is read as the records this directory holds whatever its tab is called.
			const tables = await tauri.import.readBook(path);
			// what the workspace already holds, read once for the whole file: a row duplicating a
			// record is turned away here rather than at the write, and a reference a row makes is
			// answered from the same read.
			const held = await api.workspace.held();

			fileName = path.split(/[\\/]/).pop() ?? path;
			plan = planWorkspaceImport(tables, held, [concept]);
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
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
			<!-- the file, named as the reader named it: the question is about this one and no other.
			     It sits where every dialog here puts what its title is about, rather than as a line of
			     its own competing with the answer below. -->
			<Dialog.Description class="flex items-center gap-2">
				<FileSpreadsheetIcon class="size-3.5 shrink-0" />
				<span class="min-w-0 truncate">{fileName}</span>
			</Dialog.Description>
		</Dialog.Header>

		<!-- one scroll area, and the dialog's own: a directory holds thousands of records, and a
		     panel that grows with them takes the header off the top of the window with it. -->
		<div class="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
			{#if sheet}
				{#if sheet.missingColumns.length > 0}
					<!-- a column absent, said two ways because it costs two different things. Where it is
					     one a row is identified by, the file cannot be read and that is the whole answer.
					     Where it is one a record is only built from, the file can still say which records
					     it is about — so it is a caution over a summary rather than a refusal instead of
					     one. -->
					<Callout variant={sheet.unreadable ? 'error' : 'warning'} class="flex items-start gap-3">
						<Columns3Icon class="mt-0.5 size-4 shrink-0" />
						<span class="min-w-0">
							{sheet.unreadable
								? $LL.common.import.missingColumns({ columns: sheet.missingColumns.join(', ') })
								: $LL.common.import.incompleteColumns({
										columns: sheet.missingColumns.join(', ')
									})}
						</span>
					</Callout>
				{/if}

				<!-- capped for the same reason the rows below are: a file that repeats one record
				     usually repeats a hundred, and a hundred identical callouts is a wall rather than a
				     finding. -->
				{#each sheet.collisions.slice(0, NAMED_ROWS) as collision (collision.identity)}
					<Callout variant="error" class="flex items-start gap-3">
						<CopyXIcon class="mt-0.5 size-4 shrink-0" />
						<span class="min-w-0">
							{$LL.common.import.collision({
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

				{#if !isFileRefused}
					<!-- what the file would do, in the one panel the reader has to read. What goes in
					     leads, because it is the answer to the question they asked by opening the file;
					     what is left behind follows under a rule, subordinate and quieter. -->
					<div class="flex flex-col rounded-2xl bg-muted">
						<div class="flex items-center gap-3 p-4">
							<CirclePlusIcon
								class="size-5 shrink-0 {sheet.create > 0
									? 'text-success'
									: 'text-muted-foreground'}"
							/>
							<p class="min-w-0 text-sm">
								{$LL.common.import.willCreate({ count: sheet.create })}
							</p>
						</div>

						{#if skips.length > 0}
							<div class="flex flex-col gap-2 border-t border-background/60 p-4">
								<!-- the reasons, counted. A directory turns away thousands of rows for one
								     reason, and thousands of lines each saying the same sentence tell a reader
								     less than one line saying it once with a number on it. -->
								<p
									class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
								>
									<CircleSlashIcon class="size-4 shrink-0" />
									{#each skips as skip (skip.reason)}
										<span>{toSkipLabel(skip)}</span>
									{/each}
								</p>

								<!-- and the rows worth naming: the ones a reader could act on, in the file's own
								     order so the list reads as a walk down it. The number is set as a chip so it
								     reads as a label on the reason beside it rather than as the first two words
								     of a sentence. -->
								{#if nameable.length > 0}
									<ul class="flex flex-col gap-1.5 ps-7 text-xs text-muted-foreground">
										{#each nameable.slice(0, NAMED_ROWS) as named (named.row)}
											<li class="flex items-baseline gap-2">
												<span
													class="shrink-0 rounded-md bg-background/60 px-1.5 py-0.5 font-medium tabular-nums"
												>
													{$LL.common.import.rejectedRow({ row: named.row })}
												</span>
												<span class="min-w-0">{named.reason}</span>
											</li>
										{/each}
										{#if nameable.length > NAMED_ROWS}
											<li>{$LL.common.import.more({ count: nameable.length - NAMED_ROWS })}</li>
										{/if}
									</ul>
								{/if}
							</div>
						{/if}

						{#if !offersImport}
							<!-- inside the panel, because it is what the figures above add up to rather than a
							     remark about them. -->
							<p class="border-t border-background/60 p-4 text-sm text-muted-foreground">
								{sheet.present ? $LL.common.import.nothingToCreate() : $LL.common.import.noSheets()}
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<Dialog.Footer>
			<!-- tertiary, because leaving costs nothing and the eye should land on the control that
			     does. Where the file is refused it is the only control, and leads. -->
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
