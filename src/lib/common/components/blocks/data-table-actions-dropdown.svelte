<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import * as DropdownMenu from '$lib/common/components/fragments/dropdown-menu';
	import { LL } from '$lib/i18n/i18n-svelte';
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
				<span class="sr-only">{$LL.common.actions.openMenu()}</span>
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.Group>
			<DropdownMenu.Label>{$LL.common.actions.actions()}</DropdownMenu.Label>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		{#each actions as action (action.label)}
			<DropdownMenu.Item
				{...action}
				onclick={(e) => action.onclick?.(e)}
				class={cn('capitalize', action.class ?? '')}>{action.label}</DropdownMenu.Item
			>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
