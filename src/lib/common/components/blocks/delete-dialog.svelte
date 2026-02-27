<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import { TRPCError } from '@trpc/server';

	let {
		open,
		onOpenChange,
		onSubmit,
		title = 'confirmation',
		description = 'are you sure you want to delete this record(s)?'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		title?: string;
		description?: string;
		error?: string | null;
	} = $props();

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let hasError = $state(false);

	async function submit() {
		isSubmitting = true;

		try {
			await onSubmit();
			onOpenChange(false);
		} catch (e) {
			const message = e instanceof Error && e.message ? e.message : 'unexpected error occurred!';

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
			hasError = false;
			return;
		}
	});

	$effect(() => {
		hasError = Boolean(error);
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
				cancel
			</Button>

			<Button
				variant="destructive"
				disabled={isSubmitting || hasError}
				onclick={submit}
				class="flex-1"
			>
				{#if isSubmitting}
					deleting...
				{:else}
					delete
				{/if}
			</Button>
		</section>
	</Dialog.Content>
</Dialog.Root>
