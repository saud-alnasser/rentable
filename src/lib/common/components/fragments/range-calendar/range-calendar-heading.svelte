<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: RangeCalendarPrimitive.HeadingProps = $props();
</script>

<RangeCalendarPrimitive.Heading
	bind:ref
	class={cn('px-(--cell-size) text-sm font-medium', className)}
	{...restProps}
/>
