<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> = $props();

	const contract = useDesignContract();

	const sidebar = useSidebar();
</script>

<!-- centred on the sidebar's inner edge by a logical offset of half its own width, rather than
     by the physical half-width translate it was generated with: `-translate-x-1/2` always
     moves left, so beside a logical `start-*` or `end-*` it centred the rail in one reading
     direction and pushed it a further half-width off the edge in the other. The offset is the
     one the offcanvas state already used, so that state no longer needs a rule of its own. -->
<button
	bind:this={ref}
	data-sidebar="rail"
	data-slot="sidebar-rail"
	aria-label={contract.strings.toggleSidebar}
	tabIndex={-1}
	onclick={sidebar.toggle}
	title={contract.strings.toggleSidebar}
	class={cn(
		'absolute inset-y-0 z-20 flex w-4 transition-all ease-move group-data-[side=left]:-end-2 group-data-[side=right]:-start-2 after:absolute after:inset-y-0 after:start-[calc(1/2*100%-1px)] after:w-[2px] hover:after:bg-sidebar-border',
		'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
		'[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
		'group-data-[collapsible=offcanvas]:after:start-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
