<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { Dialog as SheetPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.TitleProps = $props();
</script>

<SheetPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={cn('text-lg font-semibold tracking-tight text-foreground', className)}
	{...restProps}
/>
