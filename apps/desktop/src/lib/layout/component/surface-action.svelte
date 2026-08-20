<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import type { Component } from 'svelte';

	/**
	 * One action on an application-own surface, as a glyph that carries weight.
	 *
	 * **Not `RecordActionControl`, and the difference is the argument rather than the pixels.**
	 * That block rests quiet on purpose and says why: a glyph at rest would be the only chroma on a
	 * record surface, and it sits among a title, a body and a page of other things competing for
	 * the eye. None of that holds here. **These are the only controls on a card that has stopped
	 * the entire application**, so nothing competes and resting quiet buys nothing except a reader
	 * who cannot find the way out.
	 *
	 * They live in the standalone surface's band, which is where a reader already looks for the way
	 * past a screen, so the tooltip opens downward: there is nothing above it.
	 *
	 * *In `layout` rather than beside the block it sits in, which reads oddly and is right:
	 * [[rules/frontend]] puts app-level composites in `design/block/` and defines app-level as
	 * shared by concepts. This is shared by no concept — only by the application's own screens —
	 * so it is the shell's, and the shell's components live here.*
	 */
	let {
		label,
		icon: Icon,
		emphasis = 'secondary',
		spins = false,
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

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- **The two are the same box and must read as the same box.** They already measured the
			     same: `size-7` fixes both, and the button's base gives every variant a
			     `border-transparent` so no variant is a pixel wider than another. What made the
			     filled one look bigger was that a solid fill states its bounds and a translucent
			     ghost does not, so the answer is to give the second chip real edges rather than to
			     shrink the first.

			     Sleek rather than large, too: presence comes from the fill and from sitting alone on
			     a tinted band, not from size. A round of 9-unit buttons carrying shadows read as
			     heavy against a card whose own corners are the only other geometry. -->
			<Button
				{...props}
				variant={emphasis === 'primary' ? 'default' : 'outline'}
				size="icon-sm"
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
	</Tooltip.Trigger>
	<Tooltip.Content side="bottom" sideOffset={8}>{label}</Tooltip.Content>
</Tooltip.Root>
