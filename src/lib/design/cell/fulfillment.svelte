<script lang="ts">
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { cn } from '$lib/design/tailwind';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';
	import { onMount } from 'svelte';

	/**
	 * How much of an amount has been paid, as a ring carrying its own percentage.
	 *
	 * The figures are on the tooltip rather than on the row: a row scanning for *how far
	 * through paying this is* wants a shape, and the amounts are one hover away when it wants
	 * those instead. The percentage stays at the centre because a bare arc on a row is the
	 * shape a loading indicator takes, and a number at its middle is not.
	 */
	let {
		paid,
		expected,
		note
	}: {
		paid: number;
		expected: number;
		/** An extra line under the figures — what the caller's own money means, if anything. */
		note?: string;
	} = $props();

	const RADIUS = 14;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const fraction = $derived(expected > 0 ? Math.min(Math.max(paid / expected, 0), 1) : 0);
	const percent = $derived(Math.round(fraction * 100));
	const isSettled = $derived(fraction >= 1);

	// the ring fills from nothing to its value once, when the data it describes arrives — a
	// trigger rather than a loop. `mounted` holds it at zero for the first frame so there is
	// something to transition from; reduced motion is gated on the transition itself.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	const shown = $derived(mounted ? fraction : 0);

	const money = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto for the reason the other cells carry it: a surface may lay a
			     click target over its content and disable pointer events beneath. -->
			<span {...props} class="pointer-events-auto relative inline-flex shrink-0 items-center">
				<!-- a rotation rather than a mirrored fill: an arc starting at twelve o'clock reads
				     the same way round in both locales, where a bar filling from one edge does not. -->
				<svg viewBox="0 0 36 36" class="size-9 -rotate-90" aria-hidden="true">
					<circle
						cx="18"
						cy="18"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						class="text-foreground/12"
					/>
					<circle
						cx="18"
						cy="18"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-dasharray={CIRCUMFERENCE}
						stroke-dashoffset={CIRCUMFERENCE * (1 - shown)}
						class={cn(
							'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out',
							isSettled ? 'text-foreground' : 'text-primary'
						)}
					/>
				</svg>
				<span
					class="absolute inset-0 flex items-center justify-center text-[10px] leading-none font-medium tabular-nums"
					aria-hidden="true"
				>
					{percent}
				</span>
				<span class="sr-only">
					{$LL.common.labels.paymentFulfillment()}: {money(paid)} / {money(expected)}
				</span>
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content class="max-w-60" side="top" sideOffset={6}>
		<span class="font-medium">{money(paid)} / {money(expected)}</span>
		{#if note}
			<span class="block text-muted-foreground">{note}</span>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
