<script lang="ts" module>
	import type { Tone } from '#lib/tone.js';

	/**
	 * The two tones a settings row is drawn in: an ordinary row, and the act at the end of a group
	 * that deletes, disconnects, forgets or signs somebody out. A row reports no other kind of
	 * event, so it takes no other tone ([[rules/interface]], *Tone*: nothing gains a tone it has no
	 * caller for).
	 */
	export type SettingsRowTone = Extract<Tone, 'neutral' | 'error'>;
</script>

<script lang="ts">
	import * as Item from '#lib/primitive/item/index.js';
	import { tone as toneOf } from '#lib/tone.js';
	import type { Component, Snippet } from 'svelte';

	/**
	 * One row of a settings group: a leading glyph, a name, the value where there is one, and the
	 * control that changes it, in the manner of a platform settings pane.
	 *
	 * **The control is handed the id of the row's name**, so a control with no words of its own (a
	 * segmented choice, a switch) is labelled by the name beside it rather than by a second copy of
	 * it: the caller sets `aria-labelledby={labelId}` and a screen reader reads the row's name. A
	 * button that says what it does keeps its own words and may ignore it.
	 *
	 * **An error row is the act that ends something**, which a group draws last, after its
	 * separator. Its glyph and its name take the destructive colour; the button inside it is the
	 * caller's, a destructive ghost button, and its emphasis is shadcn's vocabulary, which *Tone*
	 * leaves to the control, rather than this block's.
	 *
	 * **What the row's state calls for is drawn beneath it, inside the row**, where a row has
	 * something to add to its value: a line saying what is under way, or a callout and the act it
	 * offers. It belongs to the row it explains, so it is not a row of its own for a screen reader
	 * to count, and it is not the group's footer, which speaks for every row.
	 *
	 * The words are the caller's, as every block in this package takes them, and are drawn as
	 * written but for the name's first letter, which is raised as a label's is.
	 */
	let {
		icon: Icon,
		name,
		value,
		control,
		beneath,
		tone = 'neutral'
	}: {
		/** The glyph that leads the row: what it is about. */
		icon: Component<{ class?: string }>;
		/** What the row is, in the reader's language. Also the control's label. */
		name: string;
		/** What it is set to now, as words or as a picture, where it has a value to show. */
		value?: string | Snippet;
		/** The control that changes it, given the id of the row's name to be labelled by. */
		control?: Snippet<[{ labelId: string }]>;
		/** What the row's state calls for, drawn beneath it inside the row, where there is any. */
		beneath?: Snippet;
		/** Whether this row ends something. Marked on the row, so a test can find it. */
		tone?: SettingsRowTone;
	} = $props();

	const labelId = $props.id();

	// the error row's glyph and name carry the tone; a neutral row's glyph is muted beside its
	// name, so the name is what reads first.
	const glyph = $derived(tone === 'error' ? toneOf({ tone }).text() : 'text-muted-foreground');
	const words = $derived(tone === 'error' ? toneOf({ tone }).text() : undefined);
</script>

<Item.Root role="listitem" size="sm" data-settings-row data-row-tone={tone}>
	<Item.Media variant="icon" class={glyph}>
		<Icon class="size-4" />
	</Item.Media>

	<Item.Content class="min-w-0">
		<!-- the title is a flex row, and a first letter is only raised in a block: the name sits in
		     one of its own. -->
		<Item.Title id={labelId} class={words}>
			<span class="inline-block first-letter:uppercase">{name}</span>
		</Item.Title>
	</Item.Content>

	{#if value !== undefined}
		<div data-row-value class="min-w-0 text-sm text-muted-foreground">
			{#if typeof value === 'string'}
				{value}
			{:else}
				{@render value()}
			{/if}
		</div>
	{/if}

	{#if control}
		<Item.Actions>
			{@render control({ labelId })}
		</Item.Actions>
	{/if}

	{#if beneath}
		<Item.Footer class="flex-col items-stretch" data-row-beneath>
			{@render beneath()}
		</Item.Footer>
	{/if}
</Item.Root>
