<script lang="ts">
	import { cn, type WithoutChildrenOrChild } from '$lib/design/tailwind.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Calendar as CalendarPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		value,
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.YearSelectProps> = $props();
</script>

<span
	class={cn(
		"relative flex h-8 items-center rounded-md border border-input bg-input/30 px-3 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none select-none hover:bg-input/50 has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
		className
	)}
>
	<CalendarPrimitive.YearSelect
		bind:ref
		class="absolute inset-0 bg-popover text-popover-foreground opacity-0"
		{...restProps}
	>
		{#snippet child({ props, yearItems, selectedYearItem })}
			<select {...props} {value}>
				{#each yearItems as yearItem (yearItem.value)}
					<option
						value={yearItem.value}
						selected={value !== undefined
							? yearItem.value === value
							: yearItem.value === selectedYearItem.value}
					>
						{yearItem.label}
					</option>
				{/each}
			</select>
			<span class="flex w-full items-center justify-between gap-2" aria-hidden="true">
				{yearItems.find((item) => item.value === value)?.label || selectedYearItem.label}
				<ChevronDownIcon class="size-4" />
			</span>
		{/snippet}
	</CalendarPrimitive.YearSelect>
</span>
