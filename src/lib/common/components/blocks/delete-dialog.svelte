<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import * as Dialog from '$lib/common/components/fragments/dialog';

	let {
		open,
		onOpenChange,
		onDelete
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onDelete: () => Promise<void> | void;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex flex-col gap-4">
		<Dialog.Header class="w-full max-w-sm">
			<Dialog.Title>confirmation</Dialog.Title>
			<Dialog.Description>are you sure you want to delete this record(s)?</Dialog.Description>
		</Dialog.Header>
		<section class="flex flex-row gap-4">
			<Button variant="outline" onclick={() => onOpenChange(false)} class="flex-1">cancel</Button>
			<Button
				variant="destructive"
				onclick={async () => {
					await onDelete();
					onOpenChange(false);
				}}
				class="flex-1">delete</Button
			>
		</section>
	</Dialog.Content>
</Dialog.Root>
