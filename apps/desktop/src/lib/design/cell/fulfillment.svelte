<script lang="ts">
	import Ring from '$lib/design/cell/ring.svelte';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';

	/**
	 * How much of an amount has been paid, as a ring carrying its own percentage.
	 *
	 * The figures are on the tooltip rather than on the row: a row scanning for *how far
	 * through paying this is* wants a shape, and the amounts are one hover away when it wants
	 * those instead. The percentage stays at the centre because a bare arc on a row is the
	 * shape a loading indicator takes, and a number at its middle is not.
	 *
	 * This is the payment reading of {@link Ring} — the arc is the treatment, and what it is an
	 * arc *of* is here.
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

	const money = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto for the reason the other cells carry it: a surface may lay a
			     click target over its content and disable pointer events beneath. -->
			<span {...props} class="pointer-events-auto inline-flex items-center">
				<Ring value={paid} total={expected} />
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
