<script lang="ts">
	import { ConfirmationSubmission } from '#lib/confirmation.svelte.js';
	import { Button } from '#lib/primitive/button/index.js';
	import { Callout } from '#lib/primitive/callout/index.js';
	import * as Dialog from '#lib/primitive/dialog/index.js';
	import { useDesignContract } from '#lib/strings.js';

	const contract = useDesignContract();

	/**
	 * The one surface that asks before an act that is not a delete: terminating a contract,
	 * restoring one, signing out elsewhere, forgetting the account, disconnecting this machine.
	 *
	 * **Named by its act, never by deleting.** The title and the confirming control are the act's
	 * own verb, so nothing here has a default for them and a caller cannot forget to say what it
	 * asks. The delete dialog beside it is kept for the deletes that still ask, the ones that
	 * remove more than the record or that nothing can take back ([[rules/interface]], *Delete and
	 * confirm*); an ordinary delete asks nothing and offers undo instead.
	 *
	 * Built the way the delete dialog is: the record the act is on leads the body, what the act
	 * does follows on its own line, leaving is the tertiary control, and a refusal the handler
	 * throws is shown inside the dialog so the reader is still at the question when they read it.
	 * The confirming control's weight is the act's tone: `error` for an act that takes something
	 * away, `neutral` for one that gives something back.
	 */
	let {
		open,
		onOpenChange,
		onSubmit,
		title,
		confirmLabel,
		confirmLoadingLabel,
		record,
		description,
		tone = 'error'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		/** the act, as the dialog's own name. */
		title: string;
		/** the act's verb, on the control that does it. */
		confirmLabel: string;
		/** what that control says while the act is in flight. */
		confirmLoadingLabel: string;
		/** the record the act is on, named as the surface names it. Omitted where there is none. */
		record?: string;
		/** what the act does, under the record. */
		description?: string;
		/** how loud the confirming control is: `error` takes something away, `neutral` does not. */
		tone?: 'neutral' | 'error';
	} = $props();

	const submission = new ConfirmationSubmission({
		isOpen: () => open,
		perform: () => onSubmit(),
		close: () => onOpenChange(false),
		unexpected: () => contract.strings.unexpectedError
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md" data-confirm-dialog>
		<Dialog.Header>
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			{#if record || description}
				<div class="space-y-1">
					{#if record}
						<p class="text-sm leading-6 font-medium break-words">{record}</p>
					{/if}
					{#if description}
						<p class="text-sm leading-6 text-muted-foreground">{description}</p>
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
			<Button
				variant="ghost"
				disabled={submission.isSubmitting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{contract.strings.cancel}
			</Button>

			<Button
				variant={tone === 'error' ? 'destructive' : 'default'}
				disabled={submission.isSubmitting}
				onclick={submission.submit}
				class="w-full sm:w-auto"
			>
				{submission.isSubmitting ? confirmLoadingLabel : confirmLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
