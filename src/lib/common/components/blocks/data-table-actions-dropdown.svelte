<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import * as DropdownMenu from '$lib/common/components/fragments/dropdown-menu';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';

	let { actions }: { actions: { label: string; onclick: () => Promise<void> | void }[] } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="relative size-8 p-0">
				<span class="sr-only">open menu</span>
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.Group>
			<DropdownMenu.Label>Actions</DropdownMenu.Label>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		{#each actions as action}
			<DropdownMenu.Item onclick={action.onclick} class="capitalize"
				>{action.label}</DropdownMenu.Item
			>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
