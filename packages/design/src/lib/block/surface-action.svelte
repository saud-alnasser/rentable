<script lang="ts">
	import { Button } from '#lib/primitive/button/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import type { Component } from 'svelte';

	/**
	 * One action on a surface that has few, as a glyph that carries weight.
	 *
	 * **Not `RecordActionControl`, and the difference is the argument rather than the pixels.**
	 * That block rests quiet on purpose and says why: a glyph at rest would be the only chroma on a
	 * record surface, and it sits among a title, a body and a page of other things competing for
	 * the eye. None of that holds here. **These are the only controls on a card that has stopped
	 * the entire application**, so nothing competes and resting quiet buys nothing except a reader
	 * who cannot find the way out.
	 *
	 * On the standalone surface it lives in the band, which is where a reader already looks for the
	 * way past a screen, so the tooltip opens downward: there is nothing above it.
	 *
	 * *It was in `layout` until 2026-08-21, on the argument that it was shared by no concept and so
	 * belonged to the shell. The settings page's two rows falsified that: a check for updates and a
	 * reveal of the log folder are a concept's, and the same glyph-that-carries-weight is what both
	 * of them wanted. [[rules/frontend]] puts a composite that reaches past the shell in
	 * `design/block/`, so it moved. The argument for the old home is kept here because it was right
	 * about the tree it was written against.*
	 */
	let {
		label,
		icon: Icon,
		emphasis = 'secondary',
		spins = false,
		tooltip = true,
		disabled = false,
		onclick
	}: {
		/** What the action is, translated. The tooltip, and the control's accessible name. */
		label: string;
		icon: Component<{ class?: string }>;
		/** whether this is the way past the screen, or the other thing that can be done. */
		emphasis?: 'primary' | 'secondary';
		/**
		 * whether the glyph turns while the pointer is on it.
		 *
		 * Only true where turning is what the action *does*. A refresh glyph rotating previews
		 * pressing it; an external-link glyph rotating is decoration, and decoration on a screen
		 * that has stopped the application is the wrong kind of confidence.
		 */
		spins?: boolean;
		/**
		 * whether the label also opens as a tooltip, or is carried by the accessible name alone.
		 *
		 * **One screen turns it off, and it is the one that cannot rely on anything.** A tooltip
		 * root reads `TooltipProvider`'s context and throws where there is none, and since #779 its
		 * content reads `DesignProvider`'s and throws too. The screen a startup draws when it
		 * failed before loading a locale is outside both providers, because both are rendered
		 * inside the locale gate in `routes/+layout.svelte`. So the window it would have filled
		 * stays empty. The label is still the control's accessible name, which is what a screen
		 * reader reads either way.
		 *
		 * **The second throw fires later than the first.** `Tooltip.Root` throws while rendering;
		 * `Tooltip.Content` is only instantiated when the tooltip opens, so on its own it would
		 * take a hover to surface. That is true of every packaged overlay now: eight of the ten
		 * families that crossed at #779 read the contract inside a content component. Here the
		 * root's throw still comes first, which is why this guard is what it always was.
		 */
		tooltip?: boolean;
		/**
		 * whether the action cannot be taken right now.
		 *
		 * **Arrived with the settings page and not with the startup screens**, which never needed
		 * it: the way past a screen that stopped the application is always available or the screen
		 * is a trap. A concept's row is different. The diagnostics row draws a folder it may not
		 * have been told the path of, and a glyph that answers a press by doing nothing is worse
		 * than one that says it cannot.
		 */
		disabled?: boolean;
		onclick: () => void;
	} = $props();

	/**
	 * **The way past the screen is not one flat colour, and it is the only gradient in this
	 * application.** *Asked for 2026-08-20, after a build where hover only moved the same fill to
	 * 90 percent of itself and read as nothing happening.*
	 *
	 * No other `bg-linear-*` or `bg-gradient-*` exists in the tree, so this is a departure rather
	 * than a house style being followed, and it is written down as one. What it buys is a control
	 * with a lit top edge and a shaded bottom, which reads as raised and therefore as pressable,
	 * and a hover that has somewhere to go: the gradient flattens toward the lighter end and the
	 * ring tightens.
	 *
	 * No lift on hover, deliberately. The button's base already owns a press with
	 * `active:translate-y-px`, and a hover that raises would fight it for the same property.
	 */
	const primary =
		'group bg-linear-to-b from-primary to-primary/75 shadow-sm ring-1 ring-primary/40 ' +
		'hover:from-primary hover:to-primary hover:shadow-md hover:ring-primary/70';

	const secondary = 'group border-border bg-card text-foreground';
</script>

<!-- **The two emphases are the same box and must read as the same box.** They already measured
     the same: `size-7` fixes both, and the button's base gives every variant a
     `border-transparent` so no variant is a pixel wider than another. What made the filled one
     look bigger was that a solid fill states its bounds and a translucent ghost does not, so the
     answer is to give the second chip real edges rather than to shrink the first.

     Sleek rather than large, too: presence comes from the fill and from sitting alone on a tinted
     band, not from size. A round of 9-unit buttons carrying shadows read as heavy against a card
     whose own corners are the only other geometry. -->
{#snippet chip(trigger: Record<string, unknown>)}
	<Button
		{...trigger}
		variant={emphasis === 'primary' ? 'default' : 'outline'}
		size="icon-sm"
		{disabled}
		class={emphasis === 'primary' ? primary : secondary}
		aria-label={label}
		{onclick}
	>
		<Icon
			class="size-4 transition-transform duration-500 {spins
				? 'motion-safe:group-hover:rotate-180'
				: 'motion-safe:group-hover:scale-110'}"
		/>
		<span class="sr-only">{label}</span>
	</Button>
{/snippet}

{#if tooltip}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render chip(props)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom" sideOffset={8}>{label}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render chip({})}
{/if}
