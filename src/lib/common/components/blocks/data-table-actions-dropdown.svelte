<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import * as DropdownMenu from '$lib/common/components/fragments/dropdown-menu';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from 'tailwind-variants';

	let {
		actions
	}: {
		actions: (DropdownMenuPrimitive.ItemProps & { label: string })[];
	} = $props();
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
			<DropdownMenu.Item
				{...action}
				onclick={(e) => action.onclick?.(e)}
				class={cn('capitalize', action.class ?? '')}>{action.label}</DropdownMenu.Item
			>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
