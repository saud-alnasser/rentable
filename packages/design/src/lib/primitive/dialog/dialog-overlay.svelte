<script lang="ts">
	import { cn } from '#lib/tailwind.js';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		motion = true,
		...restProps
	}: DialogPrimitive.OverlayProps & {
		/** whether the overlay fades in and out; the dialog it sits under decides. */
		motion?: boolean;
	} = $props();
</script>

<DialogPrimitive.Overlay
	bind:ref
	data-slot="dialog-overlay"
	class={cn(
		'fixed inset-0 z-50 bg-black/60',
		motion &&
			'duration-base data-[state=closed]:animate-out data-[state=closed]:ease-exit data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:ease-enter data-[state=open]:fade-in-0',
		className
	)}
	{...restProps}
/>
