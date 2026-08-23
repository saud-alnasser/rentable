<script lang="ts">
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '@rentable/design/tailwind.js';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import type { ComponentProps } from 'svelte';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<!--
		the surface is the dialog primitive's, by hand: same ground, same corner, same shadow, and the
		same hairline ring in place of a border. A reader meets both of these at the moment the
		application asks them to confirm something, and two confirmations sitting on different
		surfaces read as two applications.

		The interior spacing is this primitive's own and stays — dialog content is padded by its
		callers, where an alert dialog pads itself.
	-->
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		dir={localesMetadata[$locale].direction}
		class={cn(
			'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-3xl bg-card p-6 shadow-xl ring-1 ring-foreground/10 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
