<script lang="ts">
	import { cn, type WithoutChild } from '#lib/tailwind.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		indicator = 'dot',
		children: childrenProp,
		...restProps
	}: WithoutChild<DropdownMenuPrimitive.RadioItemProps> & {
		/**
		 * what marks the chosen row, in the column the row reserves at its start. `dot` is the
		 * ported radio disc and every menu's default; `check` is the checkmark a menu of places
		 * uses to say which one you are in, as the workspace control does (effort 843).
		 */
		indicator?: 'dot' | 'check';
	} = $props();
</script>

<DropdownMenuPrimitive.RadioItem
	bind:ref
	data-slot="dropdown-menu-radio-item"
	class={cn(
		"relative flex min-h-7 cursor-default items-center gap-2 rounded-xl py-1.5 ps-8 pe-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span class="pointer-events-none absolute start-2 flex size-3.5 items-center justify-center">
			{#if checked}
				{#if indicator === 'check'}
					<CheckIcon class="size-4" data-indicator="check" />
				{:else}
					<CircleIcon class="size-2 fill-current" />
				{/if}
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</DropdownMenuPrimitive.RadioItem>
