<script lang="ts">
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import type { Icon as IconComponent } from '@tabler/icons-svelte';

	/**
	 * A count, as every directory row renders one: the glyph that stands for the thing being
	 * counted, the figure, and the quantity's own name on hover.
	 *
	 * The name is on the tooltip *and* on the accessible label, because they answer different
	 * readers and a row carrying a bare glyph and a number answers neither: a door beside `12`
	 * says twelve of something.
	 */
	let {
		icon: Icon,
		count,
		label
	}: {
		/** The glyph standing for what is counted. */
		icon: IconComponent;
		count: number;
		/** What the figure counts, translated — shown on hover and read as the accessible name. */
		label: string;
	} = $props();

	const figure = $derived(formatLocaleNumber($locale, count));
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto for the same reason the status treatment carries it: a surface
			     may lay a click target over its content and disable pointer events beneath. -->
			<span
				{...props}
				class="pointer-events-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
			>
				<Icon class="size-4" aria-hidden="true" />
				<span class="tabular-nums" aria-hidden="true">{figure}</span>
				<span class="sr-only">{label}: {figure}</span>
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={6}>
		{label}
	</Tooltip.Content>
</Tooltip.Root>
