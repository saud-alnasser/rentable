<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DialogPrimitive.TitleProps = $props();
</script>

<DialogPrimitive.Title
	bind:ref
	data-slot="dialog-title"
	class={cn('text-lg leading-tight font-semibold tracking-tight', className)}
	{...restProps}
/>
