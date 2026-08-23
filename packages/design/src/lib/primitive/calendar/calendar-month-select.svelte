<script lang="ts">
	import { cn, type WithoutChildrenOrChild } from '#lib/tailwind.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Calendar as CalendarPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		value,
		onchange,
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.MonthSelectProps> = $props();
</script>

<span
	class={cn(
		"relative flex h-8 items-center rounded-md border border-input bg-input/30 px-3 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none select-none hover:bg-input/50 has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
		className
	)}
>
	<CalendarPrimitive.MonthSelect
		bind:ref
		class="absolute inset-0 bg-popover text-popover-foreground opacity-0"
		{...restProps}
	>
		{#snippet child({ props, monthItems, selectedMonthItem })}
			<select {...props} {value} {onchange}>
				{#each monthItems as monthItem (monthItem.value)}
					<option
						value={monthItem.value}
						selected={value !== undefined
							? monthItem.value === value
							: monthItem.value === selectedMonthItem.value}
					>
						{monthItem.label}
					</option>
				{/each}
			</select>
			<span class="flex w-full items-center justify-between gap-2" aria-hidden="true">
				{monthItems.find((item) => item.value === value)?.label || selectedMonthItem.label}
				<ChevronDownIcon class="size-4" />
			</span>
		{/snippet}
	</CalendarPrimitive.MonthSelect>
</span>
