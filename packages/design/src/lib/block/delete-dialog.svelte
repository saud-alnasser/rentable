<script lang="ts">
	import { isConfirmable, toConfirmation, type Blockers } from '#lib/confirmation.js';
	import { ConfirmationSubmission } from '#lib/confirmation.svelte.js';
	import type { ButtonVariant } from '#lib/primitive/button/index.js';
	import { Button } from '#lib/primitive/button/index.js';
	import { Callout } from '#lib/primitive/callout/index.js';
	import * as Dialog from '#lib/primitive/dialog/index.js';
	import { useDesignContract } from '#lib/strings.js';

	// read above the props rather than below them, as `primitive/command/command-dialog` already
	// does: four of this one's defaults are contract strings, and a default cannot name a binding
	// declared after it.
	const contract = useDesignContract();

	/**
	 * The one surface that asks before something is destroyed, shared by every action that does.
	 *
	 * It is built the way _Semantics are secondary_ (62) builds a confirmation: the action names
	 * the dialog, the record it acts on leads the sentence below, and the destructive control is
	 * the primary one — solid and high contrast — because a destructive action is primary here
	 * and nowhere else. Leaving is the tertiary control beside it, and the corner close the
	 * dialog already carries.
	 *
	 * Where something blocks the action there is no destructive control at all. The answer to the
	 * question is that it cannot be done, not that it might fail, and a control that would be
	 * refused is not an answer.
	 */
	let {
		open,
		onOpenChange,
		onSubmit,
		record,
		blockers,
		title = contract.strings.delete,
		description = contract.strings.deleteDescription,
		confirmLabel = contract.strings.delete,
		confirmLoadingLabel = contract.strings.deleting,
		confirmVariant = 'destructive'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		/** the record being acted on, named as the surface names it. */
		record?: string;
		/**
		 * What depends on the record and stops it being acted on, in the reader's words.
		 *
		 * The procedure refuses either way — this is what lets the dialog say so before
		 * offering anything destructive rather than after the control is pressed. A surface
		 * with nothing to read omits it; one that is still reading passes
		 * {@link AWAITING_BLOCKERS}.
		 */
		blockers?: Blockers;
		/** What is about to happen, as the dialog's own name. */
		title?: string;
		/** What it costs, under the record. Not shown where something blocks the action. */
		description?: string;
		confirmLabel?: string;
		confirmLoadingLabel?: string;
		confirmVariant?: ButtonVariant;
	} = $props();

	const confirmation = $derived(toConfirmation(blockers));
	const isBlocked = $derived(confirmation.state === 'blocked');

	const submission = new ConfirmationSubmission({
		isOpen: () => open,
		perform: () => onSubmit(),
		close: () => onOpenChange(false),
		unexpected: () => contract.strings.unexpectedError
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			<!-- the record leads, in the reader's own words for it: the question is about this one
			     and no other. What follows says what the action costs, or what stops it — on its own
			     line, because both sentences have a subject already and a name set in front of one
			     reads as that sentence's subject rather than as the record. -->
			<div class="space-y-1">
				<p class="text-sm leading-6 font-medium break-words">
					{record || contract.strings.unnamedRecord}
				</p>
				<p class="text-sm leading-6 text-muted-foreground">
					{isBlocked ? contract.strings.deleteBlockedDescription : description}
				</p>
			</div>

			{#if isBlocked}
				<ul class="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
					{#each confirmation.blocking as blocker (blocker)}
						<li class="flex items-start gap-2">
							<span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden="true"
							></span>
							<span class="min-w-0">{blocker}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if submission.error}
				<Callout tone="error">
					{submission.error}
				</Callout>
			{/if}
		</div>

		<Dialog.Footer>
			<!-- tertiary, because leaving costs nothing and the eye should land on the control that
			     does. Where the action is blocked it is the only control, and leads. -->
			<Button
				variant={isBlocked ? 'default' : 'ghost'}
				disabled={submission.isSubmitting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{isBlocked ? contract.strings.close : contract.strings.cancel}
			</Button>

			{#if !isBlocked}
				<Button
					variant={confirmVariant}
					disabled={!isConfirmable(confirmation.state, submission.isSubmitting)}
					onclick={submission.submit}
					class="w-full sm:w-auto"
				>
					{#if submission.isSubmitting}
						{confirmLoadingLabel}
					{:else}
						{confirmLabel}
					{/if}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
