<script lang="ts">
	import { ConfirmationSubmission } from '$lib/design/confirmation.svelte';
	import type { ButtonVariant } from '$lib/design/primitive/button';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import { groupRefusals, NAMED_RECORDS, type SelectionPlan } from '$lib/design/selection';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import { Spinner } from '@rentable/design/primitive/spinner/index.js';

	/**
	 * The one surface that asks before an action is carried out on several records, shared by
	 * every list that offers one.
	 *
	 * **It shows the outcome, then asks.** What would go through and what would not, counted by
	 * reason with a handful of the turned-away records named, before anything is written. That is
	 * `directory-import-dialog.svelte`'s answer to the same question, and the reason this takes it
	 * is that one application should not have two: a file coming in and a selection being deleted
	 * are both *part of what you asked for cannot be done*, and the destructive one had the weaker
	 * answer.
	 *
	 * **What it shows is the concept's plan, never the rows on screen.** A row carries what its
	 * own surface needed, which is rarely what a refusal turns on — so the caller asks its concept
	 * and passes the answer here. While that answer is still being read the surface says so and
	 * withholds the control, rather than showing a figure it is about to replace.
	 *
	 * **Where nothing in the selection can go through there is no destructive control at all**,
	 * the way the delete confirmation drops its own and the import dialog drops its import. The
	 * answer to the question is that it cannot be done, not that it might fail.
	 */
	let {
		open,
		onOpenChange,
		onSubmit,
		title,
		selected,
		plan,
		reasons,
		describeReason,
		summarize,
		confirmLabel,
		confirmLoadingLabel,
		confirmVariant = 'destructive'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		/** What is about to happen, as the dialog's own name. */
		title: string;
		/** How the surface names the set the reader assembled. */
		selected: string;
		/** What the action would do, or `null` while the concept is still answering. */
		plan: SelectionPlan | null;
		/** The reasons this action can turn a record away, in the order they are worth reading. */
		reasons: readonly string[];
		/** One reason with the number of records it accounts for, in the reader's words. */
		describeReason: (reason: string, count: number) => string;
		/** What would happen to the records that go through, given how many there are. */
		summarize: (count: number) => string;
		confirmLabel: string;
		confirmLoadingLabel: string;
		confirmVariant?: ButtonVariant;
	} = $props();

	const groups = $derived(plan ? groupRefusals(plan.refused, reasons) : []);
	// nothing to do rather than nothing to show: a plan that turned every record away has figures
	// worth reading and no action left to offer.
	const hasNothingToDo = $derived(plan !== null && plan.eligible.length === 0);
	const canConfirm = $derived(plan !== null && !hasNothingToDo);

	const submission = new ConfirmationSubmission({
		isOpen: () => open,
		perform: () => onSubmit(),
		close: () => onOpenChange(false),
		unexpected: () => $LL.common.messages.unexpectedError()
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
			<!-- the set, named where every dialog here puts what its title is about. The records
			     themselves are on the screen behind it; the number is what the reader cannot see. -->
			<Dialog.Description>{selected}</Dialog.Description>
		</Dialog.Header>

		<!-- one scroll area, and the dialog's own: a selection can run to hundreds, and a panel
		     that grows with it takes the header off the top of the window. -->
		<div class="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
			{#if plan === null}
				<div class="flex items-center justify-center py-6" aria-busy="true">
					<Spinner class="size-6 text-muted-foreground" />
				</div>
			{:else}
				<!-- what the action would do, in the one panel the reader has to read. What goes
				     through leads, because it is the answer to the question they asked by reaching for
				     the control; what is left behind follows under a rule, subordinate and quieter. -->
				<div class="flex flex-col rounded-2xl bg-muted">
					<div class="flex items-center gap-3 p-4">
						<CircleCheckIcon
							class="size-5 shrink-0 {hasNothingToDo ? 'text-muted-foreground' : ''}"
						/>
						<p class="min-w-0 text-sm">{summarize(plan.eligible.length)}</p>
					</div>

					{#if groups.length > 0}
						<div class="flex flex-col gap-2 border-t border-background/60 p-4">
							{#each groups as group (group.reason)}
								<!-- the reason, counted, and then a handful of the records it accounts for.
								     A directory turns away hundreds for one reason, and hundreds of lines
								     each saying the same sentence tell a reader less than one line saying it
								     once with a number on it. -->
								{@const named = group.records
									.map((refusal) => refusal.name)
									.filter((name) => name.length > 0)}
								<div class="flex flex-col gap-1 text-xs text-muted-foreground">
									<p class="flex items-start gap-2">
										<CircleSlashIcon class="mt-0.5 size-4 shrink-0" />
										<span class="min-w-0">{describeReason(group.reason, group.records.length)}</span
										>
									</p>
									{#if named.length > 0}
										<p class="min-w-0 ps-6 break-words">
											{named.slice(0, NAMED_RECORDS).join(', ')}{named.length > NAMED_RECORDS
												? `, ${$LL.common.selection.more({ count: named.length - NAMED_RECORDS })}`
												: ''}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if hasNothingToDo}
						<!-- inside the panel, because it is what the figures above add up to rather than a
						     remark about them. -->
						<p class="border-t border-background/60 p-4 text-sm text-muted-foreground">
							{$LL.common.selection.nothingToDo()}
						</p>
					{/if}
				</div>
			{/if}

			{#if submission.error}
				<Callout tone="error">
					{submission.error}
				</Callout>
			{/if}
		</div>

		<Dialog.Footer>
			<!-- tertiary, because leaving costs nothing and the eye should land on the control that
			     does. Where there is nothing to do it is the only control, and leads. -->
			<Button
				variant={canConfirm ? 'ghost' : 'default'}
				disabled={submission.isSubmitting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{canConfirm ? $LL.common.actions.cancel() : $LL.common.ui.close()}
			</Button>

			{#if !hasNothingToDo}
				<Button
					variant={confirmVariant}
					disabled={!canConfirm || submission.isSubmitting}
					onclick={submission.submit}
					class="w-full sm:w-auto"
				>
					{submission.isSubmitting ? confirmLoadingLabel : confirmLabel}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
