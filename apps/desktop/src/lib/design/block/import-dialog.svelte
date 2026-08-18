<script lang="ts" generics="TRecord extends Record<string, string>">
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import { isImportable, planImport, type ImportField, type ImportPlan } from '$lib/design/import';
	import { showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import CirclePlusIcon from '@lucide/svelte/icons/circle-plus';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import CopyXIcon from '@lucide/svelte/icons/copy-x';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';

	/**
	 * Reading a file into a directory: choose it, see what it would do, then agree to it.
	 *
	 * **Nothing is written until the last step.** The reader is shown what would be created and
	 * what would be turned away, with a reason for each, and the write only happens if they say
	 * so — which is the whole difference between an import and a file that silently rewrites a
	 * workspace.
	 *
	 * Where the file itself is at fault there is no import control at all, the way the delete
	 * dialog drops its destructive control when something blocks it: the answer is that this file
	 * cannot be read, not that reading it might fail, and a control that would be refused is not
	 * an answer. A file that contradicts itself is one such fault — two rows claiming one record
	 * are both the reader's, choosing between them is not something this can do quietly, and a
	 * batch cannot branch on its own results anyway.
	 */
	let {
		open = $bindable(false),
		fields,
		validate,
		existingIdentities,
		onConfirm,
		title
	}: {
		open?: boolean;
		/** the columns this concept reads from a file. */
		fields: readonly ImportField<TRecord>[];
		/** the concept's own rule for one record — the reason it is refused, or nothing. */
		validate: (record: TRecord) => string | undefined;
		/** what is already held, so a row duplicating a record is turned away rather than failing. */
		existingIdentities: () => Promise<ReadonlySet<string>>;
		/** write the records the reader agreed to. */
		onConfirm: (records: TRecord[]) => Promise<void>;
		/** what the dialog is called, in the concept's own words. */
		title: string;
	} = $props();

	let isReading = $state(false);
	let isWriting = $state(false);
	let plan = $state<ImportPlan<TRecord> | null>(null);
	let fileName = $state('');

	// the file is at fault rather than any row in it: a heading it never carried, or two of its
	// own rows claiming one record. Nothing in it can be read, so what each row would have done
	// is moot — showing it would suggest a partial outcome that cannot happen.
	const isFileRefused = $derived(
		plan !== null && (plan.missingColumns.length > 0 || plan.collisions.length > 0)
	);
	// nothing would be created, so there is nothing to agree to. The rows and their reasons are
	// still shown — that is the whole of what the reader came for — but the control that would
	// write them is not offered, the same way the delete dialog drops a control that would be
	// refused. A disabled one says *maybe*; its absence says what is true.
	const offersImport = $derived(plan !== null && !isFileRefused && plan.create.length > 0);
	const canConfirm = $derived(plan !== null && isImportable(plan) && !isWriting);

	/**
	 * Why a row was turned away, in the reader's language.
	 *
	 * A row the concept itself refused already carries the concept's own sentence and is passed
	 * through; the two this decides — a value that was not there, and a record that already is —
	 * are the pass's own findings, and it names them rather than leaving a bare column or id
	 * sitting beside a row number.
	 */
	function toReason(rejection: ImportPlan<TRecord>['rejected'][number]) {
		switch (rejection.reason) {
			case 'duplicate-of-existing':
				return $LL.common.import.reasons.duplicateOfExisting({ detail: rejection.detail });
			case 'missing-value':
				return $LL.common.import.reasons.missingValue({ detail: rejection.detail });
			default:
				return rejection.detail;
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

			const table = await tauri.import.read(path);
			const existing = await existingIdentities();

			fileName = path.split(/[\\/]/).pop() ?? path;
			plan = planImport(fields, table, validate, existing);
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
			await onConfirm(plan.create.map((held) => held.record));
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
			     It sits where every dialog here puts what its title is about, rather than as a line
			     of its own competing with the answer below. -->
			<Dialog.Description class="flex items-center gap-2">
				<FileSpreadsheetIcon class="size-3.5 shrink-0" />
				<span class="min-w-0 truncate">{fileName}</span>
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			{#if plan}
				{#if plan.missingColumns.length > 0}
					<Callout variant="error" class="flex items-start gap-3">
						<Columns3Icon class="mt-0.5 size-4 shrink-0" />
						<span class="min-w-0">
							{$LL.common.import.missingColumns({ columns: plan.missingColumns.join(', ') })}
						</span>
					</Callout>
				{/if}

				{#each plan.collisions as collision (collision.identity)}
					<!-- the criterion: the file contradicts itself, so it is refused whole and both rows
					     are named. Nothing has been written at this point and nothing will be. -->
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

				{#if !isFileRefused}
					<!-- what the file would do, in the one panel the reader has to read. What goes in
					     leads, because it is the answer to the question they asked by opening the file;
					     what is left behind follows under a rule, subordinate and quieter. -->
					<div class="flex flex-col rounded-2xl bg-muted">
						<div class="flex items-center gap-3 p-4">
							<CirclePlusIcon
								class="size-5 shrink-0 {plan.create.length > 0
									? 'text-success'
									: 'text-muted-foreground'}"
							/>
							<p class="min-w-0 text-sm">
								{$LL.common.import.willCreate({ count: plan.create.length })}
							</p>
						</div>

						{#if plan.rejected.length > 0}
							<div class="flex flex-col gap-2 border-t border-background/60 p-4">
								<p class="flex items-center gap-3 text-sm text-muted-foreground">
									<CircleSlashIcon class="size-4 shrink-0" />
									<span class="min-w-0"
										>{$LL.common.import.willReject({ count: plan.rejected.length })}</span
									>
								</p>

								<!-- each row named rather than counted: a reader who has to fix the file needs
								     the line number, and a total tells them only how long the search is. The
								     number is set as a chip so it reads as a label on the reason beside it
								     rather than as the first two words of a sentence. -->
								<ul class="flex max-h-40 flex-col gap-1.5 overflow-y-auto ps-7 text-xs">
									{#each plan.rejected as rejection (rejection.row)}
										<li class="flex items-baseline gap-2">
											<span
												class="shrink-0 rounded-md bg-background/60 px-1.5 py-0.5 font-medium text-muted-foreground tabular-nums"
											>
												{$LL.common.import.rejectedRow({ row: rejection.row })}
											</span>
											<span class="min-w-0 text-muted-foreground">{toReason(rejection)}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if !offersImport}
							<!-- inside the panel, because it is what the figures above add up to rather than
							     a remark about them. -->
							<p class="border-t border-background/60 p-4 text-sm text-muted-foreground">
								{$LL.common.import.nothingToCreate()}
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
