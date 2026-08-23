<script lang="ts">
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'legend',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLLegendElement>> & {
		variant?: 'legend' | 'label';
	} = $props();
</script>

<!--
	the capitalize is by hand, and it belongs here rather than at each caller: every legend in this
	application names a group of settings, every locale string is written lowercase, and every other
	title puts the case back the same way. Eight callers doing it themselves is eight places for one
	of them to be forgotten, which is how the six lowercase titles this fixes came about.
-->
<legend
	bind:this={ref}
	data-slot="field-legend"
	data-variant={variant}
	class={cn(
		'mb-3 font-medium capitalize',
		'data-[variant=legend]:text-base',
		'data-[variant=label]:text-sm',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</legend>
