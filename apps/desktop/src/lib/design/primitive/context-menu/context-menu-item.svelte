<script lang="ts">
	import { cn } from '@rentable/design/tailwind.js';
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = 'default',
		...restProps
	}: ContextMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: 'default' | 'destructive';
	} = $props();
</script>

<ContextMenuPrimitive.Item
	bind:ref
	data-slot="context-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium outline-hidden transition-colors select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:ps-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:!text-destructive",
		className
	)}
	{...restProps}
/>
