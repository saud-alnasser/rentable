<script lang="ts">
	import { cn } from '@rentable/design/tailwind.js';
	import type IdCardIcon from '@lucide/svelte/icons/id-card';
	import type { Snippet } from 'svelte';
	import { factLeading } from '$lib/design/cell/fact.svelte';
	import { statusTones, type StatusName } from '$lib/design/cell/status.svelte';

	type IconComponent = typeof IdCardIcon;

	/**
	 * One field of a record card: a softly tinted tile holding its glyph and its name, small and
	 * muted, over the value in the stronger weight (effort 846, tickets 37, 39 and 41).
	 *
	 * Short values side by side are the dashboard case, where a name is wanted to tell them apart
	 * and is drawn as supporting content (_Labels are a last resort_, its *Labels are secondary*,
	 * 51). The tint is the muted token on the card's own surface, which sets each field apart with
	 * no border (_Use fewer borders_, 240), and it resolves through the tokens in the dark as in
	 * the light.
	 *
	 * **A value saying nothing is there** (*not yet*, *none*) is marked `empty` and drawn muted
	 * rather than in the value's colour, so the fields holding something lead (_Emphasize by
	 * de-emphasizing_, 46). **A value that is a state** takes that status's tone, from the one
	 * table the status and count cells read, and nothing else takes a colour: a field is not an
	 * event to report ([[rules/interface]], *Tone*).
	 *
	 * Both lines set the tile's fixed leading, so a field is 8 + 20 + 20 + 8 = 56 px in both
	 * locales and a card counting its fields can declare its height rather than measure it.
	 *
	 * The cell marks itself `data-field`, its name `data-field-name` and its value
	 * `data-field-value`. A card that names its own fields passes `hook`, and the three carry
	 * `data-<hook>`, `data-<hook>-name` and `data-<hook>-value` as well; attributes passed to the
	 * cell land on the tile, and `valueAttributes` on the value.
	 */
	let {
		icon: Icon,
		name,
		value,
		children,
		empty = false,
		status,
		hook,
		valueAttributes,
		class: className,
		...rest
	}: {
		/** the glyph standing for what the field is. */
		icon: IconComponent;
		/** what the field is, in the reader's words. */
		name: string;
		/** the value as the application's own words; a value a person typed is drawn through `children` as `Cell.Text`. */
		value?: string;
		/** the value, drawn by the caller, where it is a cell such as `Cell.Money`. */
		children?: Snippet;
		/** whether the value says nothing is there, which draws it muted. */
		empty?: boolean;
		/** the status the value is, where it is one, which lends the value that status's tone. */
		status?: StatusName;
		/** the caller's own name for its fields, carried as `data-<hook>` hooks. */
		hook?: string;
		/** attributes for the value's line, such as a data hook a test reads it by. */
		valueAttributes?: Record<string, string | number>;
		class?: string;
		[attribute: `data-${string}`]: string | number | undefined;
	} = $props();

	const hooks = (suffix: string) =>
		hook ? { [`data-${hook}${suffix}`]: '' } : ({} as Record<string, string>);

	const valueTone = $derived(
		empty ? 'text-muted-foreground' : status ? statusTones[status] : 'text-foreground'
	);
</script>

<div
	data-field
	{...hooks('')}
	{...rest}
	class={cn('flex min-w-0 flex-col rounded-lg bg-muted px-3 py-2', className)}
>
	<span
		data-field-name
		{...hooks('-name')}
		class={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', factLeading)}
	>
		<Icon class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
		<span class="truncate">{name}</span>
	</span>
	<span
		data-field-value
		data-empty={empty ? '' : undefined}
		{...hooks('-value')}
		{...valueAttributes}
		class={cn('truncate text-sm font-medium', factLeading, valueTone)}
	>
		{#if children}
			{@render children()}
		{:else}
			{value}
		{/if}
	</span>
</div>
