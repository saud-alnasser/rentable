<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { mode } from 'mode-watcher';

	let { ...restProps }: SonnerProps = $props();
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
-->
<Sonner
	theme={mode.current}
	class="toaster group"
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
