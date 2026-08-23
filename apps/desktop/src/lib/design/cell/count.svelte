<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * What a figure is standing for, in the tone vocabulary the status treatment declares:
	 * `running` is live, `settled` is finished or empty.
	 *
	 * `money` is the one entry not keyed on state, and it is stated here because that is the thing
	 * a reader of this list has to know: everywhere else on a directory row a colour reports a
	 * condition, so a figure counting money in the state colour would be claiming a condition it
	 * cannot have. It has a name of its own in the stylesheet for the same reason.
	 */
	export type CountTone = 'running' | 'settled' | 'money';

	/**
	 * What the figure itself wears, wherever a directory row states a quantity.
	 *
	 * One declaration, read by the status-keyed count beside this one as well, because the figures
	 * on a row have to line up down the list and two of them deciding their own measure is how a
	 * trailing cluster comes to read ragged.
	 *
	 * **The measure is fixed, so a row's trailing figures form columns down the list.** Sized to
	 * the digits rather than to a length — `ch` is the advance width of a zero in whatever font is
	 * rendering, so a locale whose digits are wider gets a wider column rather than a cramped one,
	 * which a value in rem could not do. Three of them, because that covers every quantity this
	 * domain counts; it is a floor and not a cap, so a figure that genuinely needs more takes it
	 * and pushes the cluster rather than being clipped.
	 *
	 * Aligned to the end, or the fixed measure would leave a one-digit figure sitting away from the
	 * column its neighbours below it line up on.
	 */
	export const countFigure = 'min-w-[3ch] text-end tabular-nums';

	// the same two tones `active`/`occupied` and `vacant` carry on a status glyph, so a count
	// and a status never disagree about what blue means.
	const cell = tv({
		base: 'pointer-events-auto flex shrink-0 items-center gap-1.5 text-xs',
		variants: {
			tone: {
				running: 'text-primary',
				settled: 'text-muted-foreground',
				money: 'text-money'
			} satisfies Record<CountTone, string>
		}
	});
</script>

<script lang="ts">
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import type { Icon as IconComponent } from '@tabler/icons-svelte';

	/**
	 * A count, as every directory row renders one: the glyph that stands for the thing being
	 * counted, the figure, and the quantity's own name on hover.
	 *
	 * The name is on the tooltip *and* on the accessible label, because they answer different
	 * readers and a row carrying a bare glyph and a number answers neither: a grid beside `12`
	 * says twelve of something.
	 */
	let {
		icon: Icon,
		count,
		label,
		tone = 'settled'
	}: {
		/** The glyph standing for what is counted. */
		icon: IconComponent;
		count: number;
		/** What the figure counts, translated — shown on hover and read as the accessible name. */
		label: string;
		/**
		 * Whether this figure stands for something live. The caller decides, because only the
		 * caller knows what its own quantity means; `settled` is the tone every count carried
		 * before any of them could say otherwise.
		 */
		tone?: CountTone;
	} = $props();

	const figure = $derived(formatLocaleNumber($locale, count));
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto for the same reason the status treatment carries it: a surface
			     may lay a click target over its content and disable pointer events beneath. -->
			<span {...props} class={cell({ tone })}>
				<Icon class="size-4" aria-hidden="true" />
				<span class={countFigure} aria-hidden="true">{figure}</span>
				<span class="sr-only">{label}: {figure}</span>
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={6}>
		{label}
	</Tooltip.Content>
</Tooltip.Root>
