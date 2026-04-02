<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DialogPrimitive.DescriptionProps = $props();
</script>

<DialogPrimitive.Description
	bind:ref
	data-slot="dialog-description"
	class={cn('text-sm leading-6 text-muted-foreground', className)}
	{...restProps}
/>
