<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';
	export const sheetVariants = tv({
		base: 'fixed z-50 flex max-h-screen flex-col gap-0 overflow-hidden bg-card shadow-xl ring-1 ring-foreground/10 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
		variants: {
			side: {
				top: 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto',
				bottom:
					'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto',
				left: 'data-[state=closed]:slide-out-to-start data-[state=open]:slide-in-from-start inset-y-0 start-0 h-full w-3/4 sm:max-w-sm',
				right:
					'data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end inset-y-0 end-0 h-full w-3/4 sm:max-w-sm'
			}
		},
		defaultVariants: {
			side: 'right'
		}
	});

	export type Side = VariantProps<typeof sheetVariants>['side'];
</script>

<script lang="ts">
	import { cn, type WithoutChildrenOrChild } from '@rentable/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import type { ComponentProps, Snippet } from 'svelte';
	import SheetOverlay from './sheet-overlay.svelte';
	import SheetPortal from './sheet-portal.svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		side?: Side;
		children: Snippet;
	} = $props();

	const resolvedSide = $derived.by(() => {
		if (side && side !== 'right') {
			return side;
		}

		return localesMetadata[$locale].direction === 'rtl' ? 'left' : 'right';
	});
</script>

<SheetPortal {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		dir={localesMetadata[$locale].direction}
		class={cn(sheetVariants({ side: resolvedSide }), className)}
		{...restProps}
	>
		{@render children?.()}
		<SheetPrimitive.Close
			class="absolute end-4 top-4 rounded-full bg-secondary p-1.5 opacity-80 transition-[opacity,background-color] hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none"
		>
			<XIcon class="size-4" />
			<span class="sr-only">{$LL.common.ui.close()}</span>
		</SheetPrimitive.Close>
	</SheetPrimitive.Content>
</SheetPortal>
