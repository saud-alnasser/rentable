<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn, type WithoutChildrenOrChild } from '#lib/tailwind.js';
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { ComponentProps, Snippet } from 'svelte';
	import DialogPortal from './dialog-portal.svelte';
	import * as Dialog from './index.js';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		motion = true,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
		/**
		 * whether the dialog and its overlay animate in and out. Off for a surface reached from the
		 * keyboard many times a day, the command palette, where an entrance is a wait rather than an
		 * answer. A prop rather than a class, because class merging cannot take an animation back off.
		 */
		motion?: boolean;
	} = $props();

	const contract = useDesignContract();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay {motion} />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			'fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-3xl bg-card p-0 shadow-xl ring-1 ring-foreground/10 sm:max-w-lg',
			motion &&
				'duration-base data-[state=closed]:animate-out data-[state=closed]:ease-exit data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:ease-enter data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
			className
		)}
		dir={contract.direction}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				class="absolute inset-e-4 top-4 rounded-full bg-secondary p-1.5 opacity-80 transition-[opacity,background-color] hover:bg-accent hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
			>
				<XIcon />
				<span class="sr-only">{contract.strings.close}</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
