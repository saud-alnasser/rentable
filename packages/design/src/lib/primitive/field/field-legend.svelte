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
	the case is set by hand, and it belongs here rather than at each caller: every legend in this
	application heads a group of settings, and every locale string is written lowercase. Sentence
	case, the first letter alone: a legend can carry a person's own value ("export and import
	default") and joining words ("this machine and turso"), and `capitalize` raised both. Ticket 28
	of effort 832; the settings area's other headings take the same case.
-->
<legend
	bind:this={ref}
	data-slot="field-legend"
	data-variant={variant}
	class={cn(
		'mb-3 font-medium first-letter:uppercase',
		'data-[variant=legend]:text-base',
		'data-[variant=label]:text-sm',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</legend>
