<script lang="ts">
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
		 * offering anything destructive rather than after the control is pressed. `undefined`
		 * is *not yet known*, which is not the same answer as *nothing*: until the surface has
		 * read what depends on the record, the destructive control waits rather than offering
		 * a deletion that may be refused.
		 */
		blockers?: string[];
		title?: string;
		description?: string;
		confirmLabel?: string;
		confirmLoadingLabel?: string;
		confirmVariant?: ButtonVariant;
	} = $props();

	const isBlocked = $derived(blockers !== undefined && blockers.length > 0);
	const isUnknown = $derived(blockers === undefined);

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let hasError = $derived(Boolean(error));

	async function submit() {
		isSubmitting = true;

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

			{#if isBlocked && blockers}
				<ul class="flex flex-col gap-1 text-sm text-muted-foreground">
					{#each blockers as blocker (blocker)}
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
					disabled={isSubmitting || hasError || isUnknown}
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
