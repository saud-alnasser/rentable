<script lang="ts">
	import type { ButtonVariant } from '$lib/common/components/fragments/button';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { TRPCError } from '@trpc/server';

	let {
		open,
		onOpenChange,
		onSubmit,
		title = $LL.common.deleteDialog.title(),
		description = $LL.common.deleteDialog.description(),
		confirmLabel = $LL.common.actions.delete(),
		confirmLoadingLabel = $LL.common.actions.deleting(),
		confirmVariant = 'destructive'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		title?: string;
		description?: string;
		confirmLabel?: string;
		confirmLoadingLabel?: string;
		confirmVariant?: ButtonVariant;
	} = $props();

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
	<Dialog.Content class="flex flex-col gap-4">
		<Dialog.Header class="w-full max-w-sm">
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>

		{#if error}
			<Callout variant="error">
				{error}
			</Callout>
		{/if}

		<section class="flex flex-row gap-4">
			<Button
				variant="outline"
				disabled={isSubmitting}
				onclick={() => onOpenChange(false)}
				class="flex-1"
			>
				{$LL.common.actions.cancel()}
			</Button>

			<Button
				variant={confirmVariant}
				disabled={isSubmitting || hasError}
				onclick={submit}
				class="flex-1"
			>
				{#if isSubmitting}
					{confirmLoadingLabel}
				{:else}
					{confirmLabel}
				{/if}
			</Button>
		</section>
	</Dialog.Content>
</Dialog.Root>
