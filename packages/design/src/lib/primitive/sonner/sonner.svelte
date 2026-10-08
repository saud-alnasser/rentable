<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	import { useDesignContract } from '#lib/strings.js';
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';

	let { ...restProps }: SonnerProps = $props();

	const contract = useDesignContract();
</script>

<!--
	**The four toned toasts draw the application's tone tokens**, which is `#lib/tone.ts`'s
	vocabulary reaching the one surface that is not a surface. *Added 2026-08-20.*

	Before it, `richColors` was off and every toast was the same popover grey: a success and a
	failure differed by their glyph and by nothing else, which is the complaint that got the
	standalone surface a tone in the first place. A toast is the shortest-lived thing the
	application shows and the one a reader is least likely to be looking directly at, so it is the
	worst place to spend the difference on an icon alone.

	The wash is mixed rather than authored: `color-mix` over the popover ground keeps a toast a
	toast, and keeps these four in step with the tokens instead of beside them.

	**`theme` is the application's to pass**, as the appearance it resolved: this package does not
	choose light or dark, and sonner cannot read the class on `<html>`. *It read `mode-watcher`
	until effort 832, which followed nothing the application set, so toasts stayed dark in light.*

	**The side, the direction and the close control's name are the design contract's.** Toasts
	stand at the bottom end of the window, which is the right in a left-to-right reading and the
	left in a right-to-left one. svelte-sonner places a toaster physically, by `position`, and reads
	`dir="auto"` from the document once and keeps it, so both are handed over from the contract and
	follow a change of language. *Added by effort 861, requirement 4: the toaster stood at the bottom
	right in Arabic, where every other surface mirrors.*
-->
<Sonner
	class="toaster group"
	position={contract.direction === 'rtl' ? 'bottom-left' : 'bottom-right'}
	dir={contract.direction}
	closeButtonAriaLabel={contract.strings.close}
	richColors
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);
	       --success-bg: color-mix(in oklab, var(--success) 12%, var(--popover)); --success-border: color-mix(in oklab, var(--success) 30%, transparent); --success-text: var(--success);
	       --error-bg: color-mix(in oklab, var(--destructive) 12%, var(--popover)); --error-border: color-mix(in oklab, var(--destructive) 30%, transparent); --error-text: var(--destructive);
	       --warning-bg: color-mix(in oklab, var(--warning) 12%, var(--popover)); --warning-border: color-mix(in oklab, var(--warning) 30%, transparent); --warning-text: var(--warning);
	       --info-bg: color-mix(in oklab, var(--info) 12%, var(--popover)); --info-border: color-mix(in oklab, var(--info) 30%, transparent); --info-text: var(--info);"
	{...restProps}
	>{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
