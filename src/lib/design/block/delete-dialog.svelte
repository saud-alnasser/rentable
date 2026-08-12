<script lang="ts">
	import { isConfirmable, toConfirmation, type Blockers } from '$lib/design/confirmation';
	import type { ButtonVariant } from '$lib/design/primitive/button';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { TRPCError } from '@trpc/server';

	let {
		open,
		onOpenChange,
		onSubmit,
		record,
		blockers,
		title = $LL.common.deleteDialog.title(),
		description = $LL.common.deleteDialog.description(),
		confirmLabel = $LL.common.actions.delete(),
		confirmLoadingLabel = $LL.common.actions.deleting(),
		confirmVariant = 'destructive'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		/** the record being deleted, named as the surface names it. */
		record?: string;
		/**
		 * What depends on the record and stops it being deleted, in the reader's words.
		 *
		 * The procedure refuses either way — this is what lets the dialog say so before
		 * offering anything destructive rather than after the control is pressed. A surface
		 * with nothing to read omits it; one that is still reading passes
		 * {@link AWAITING_BLOCKERS}.
		 */
		blockers?: Blockers;
		title?: string;
		description?: string;
		confirmLabel?: string;
		confirmLoadingLabel?: string;
		confirmVariant?: ButtonVariant;
	} = $props();

	const confirmation = $derived(toConfirmation(blockers));
	const isBlocked = $derived(confirmation.state === 'blocked');

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	async function submit() {
		isSubmitting = true;
		// a refusal describes the attempt that earned it, not the one starting now — leaving it
		// standing is what turned one refusal into a dialog that could never be pressed again.
		error = null;

		try {
			await onSubmit();
			onOpenChange(false);
		} catch (e) {
			const message =
				e instanceof Error && e.message ? e.message : $LL.common.messages.unexpectedError();

			if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
				error = message;
			}
		} finally {
			isSubmitting = false;
		}
	}

	$effect(() => {
		if (!open) {
			isSubmitting = false;
			error = null;
			return;
		}
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			<div
				class="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-muted-foreground"
			>
				<!-- the record leads: the question is about this one and no other. -->
				{#if record}
					<p class="mb-1 font-medium break-words text-foreground">{record}</p>
				{/if}
				{isBlocked ? $LL.common.deleteDialog.blockedDescription() : description}
			</div>

			{#if isBlocked}
				<ul class="flex flex-col gap-1 text-sm text-muted-foreground">
					{#each confirmation.blocking as blocker (blocker)}
						<li class="flex items-start gap-2">
							<span class="mt-2 size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true"
							></span>
							<span class="min-w-0">{blocker}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<Callout variant="error">
					{error}
				</Callout>
			{/if}
		</div>

		<Dialog.Footer>
			<Button
				variant="outline"
				disabled={isSubmitting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{isBlocked ? $LL.common.ui.close() : $LL.common.actions.cancel()}
			</Button>

			<!-- nothing destructive is offered where something blocks the deletion: the answer to
			     the question is that it cannot be done, not that it might fail. -->
			{#if !isBlocked}
				<Button
					variant={confirmVariant}
					disabled={!isConfirmable(confirmation.state, isSubmitting)}
					onclick={submit}
					class="w-full sm:w-auto"
				>
					{#if isSubmitting}
						{confirmLoadingLabel}
					{:else}
						{confirmLabel}
					{/if}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
