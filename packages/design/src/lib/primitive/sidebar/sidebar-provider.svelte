<script lang="ts">
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		SIDEBAR_COOKIE_MAX_AGE,
		SIDEBAR_COOKIE_NAME,
		SIDEBAR_WIDTH,
		SIDEBAR_WIDTH_ICON
	} from './constants.js';
	import { setSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		open = $bindable(true),
		onOpenChange = () => {},
		class: className,
		style,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	} = $props();

	// **the toggle's keys are the consumer's to register, not this component's.** the state
	// created here holds `toggle`, and `SIDEBAR_KEYBOARD_SHORTCUT` in `./constants.js` is the key
	// it answers to, but what a shortcut registration says about itself is read from the
	// registering application's own translations, which this package cannot reach. so a consumer
	// calls `useSidebar()` beside its own rail and registers `toggle` there. `./context.svelte.js`
	// carries the whole of it. there is no window listener of this primitive's own either way.
	setSidebar({
		open: () => open,
		setOpen: (value: boolean) => {
			open = value;
			onOpenChange(value);

			// This sets the cookie to keep the sidebar state.
			document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
		}
	});
</script>

<Tooltip.Provider delayDuration={0}>
	<div
		data-slot="sidebar-wrapper"
		style="--sidebar-width: {SIDEBAR_WIDTH}; --sidebar-width-icon: {SIDEBAR_WIDTH_ICON}; {style}"
		class={cn(
			'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
</Tooltip.Provider>
