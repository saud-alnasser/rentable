<script lang="ts">
	import { cn } from '#lib/tailwind.js';
	import { Calendar as CalendarPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.CellProps = $props();
</script>

<CalendarPrimitive.Cell
	bind:ref
	class={cn('relative size-(--cell-size) p-0 text-center text-sm focus-within:z-20', className)}
	{...restProps}
/>
