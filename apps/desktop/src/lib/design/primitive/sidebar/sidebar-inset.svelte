<script lang="ts">
	import { cn, type WithElementRef } from '$lib/design/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<main
	bind:this={ref}
	data-slot="sidebar-inset"
	class={cn(
		'relative flex w-full min-w-0 flex-1 flex-col overflow-hidden bg-background',
		'peer-data-[variant=inset]:m-2 peer-data-[variant=inset]:rounded-2xl peer-data-[variant=inset]:shadow-sm peer-data-[variant=inset]:ring-1 peer-data-[variant=inset]:ring-foreground/10',
		// the start margin closes only where the rail is actually alongside: below the shell's
		// breakpoint the navigation is an overlay and nothing sits there, so the panel keeps an
		// even margin rather than butting against an edge with no sidebar behind it.
		'shell:peer-data-[variant=inset]:ms-0 shell:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</main>
