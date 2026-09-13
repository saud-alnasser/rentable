<script lang="ts">
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...props
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="input-group"
	role="group"
	class={cn(
		// The group draws the owned input's own geometry (`primitive/input`): the same height,
		// the same pill, the same fill, no border and no shadow, so a field with a leading glyph
		// sits beside a field without one and nobody can tell which primitive drew which. The
		// registry's stock look (h-9, rounded-md, bordered, shadowed) was what shipped at #793
		// and it matched nothing else on the page once `input` had been restyled. Effort 824,
		// decided 2026-09-12.
		'group/input-group relative flex w-full items-center rounded-2xl border border-transparent bg-input/50 transition-[background-color,border-color,box-shadow] outline-none hover:bg-input/60',
		'h-8 has-[>textarea]:h-auto',

		// Variants based on alignment.
		'has-[>[data-align=inline-start]]:[&>input]:ps-2',
		'has-[>[data-align=inline-end]]:[&>input]:pe-2',
		'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
		'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

		// Focus state, the input's own ring.
		'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/30',

		// Error state, the input's own ring.
		'has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20',

		className
	)}
	{...props}
>
	{@render children?.()}
</div>
