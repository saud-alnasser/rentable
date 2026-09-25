<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The head a section of a member's sheet opens with: its name, one sentence, and the control
	 * that adds to it where it has one.
	 *
	 * **Plainer than the role's tray**, and deliberately: the tray is the one bar on the surface,
	 * and a list underneath that repeats the treatment reads as a second form rather than as a
	 * list. *Both lists carried the bar until the human's third look (effort 828).*
	 *
	 * **Shared by the two sheets a member has**, the one that adds them (`account-form.svelte`)
	 * and the one that edits them (`member-sheet.svelte`), so the two read as one surface in two
	 * moments (ticket 42 of effort 832). The legend's id is `<id>-legend`, which is what each
	 * section's `aria-labelledby` names.
	 */
	let {
		id,
		legend,
		description,
		control = null
	}: {
		/** the section's name in the document: its legend is `<id>-legend`. */
		id: string;
		legend: string;
		description: string;
		/** the control that adds to the section, drawn at the end of the head. */
		control?: Snippet | null;
	} = $props();
</script>

<div class="flex items-start justify-between gap-3" data-list-head={id}>
	<div class="min-w-0">
		<Field.Legend id={`${id}-legend`} variant="label" class="mb-1">{legend}</Field.Legend>
		<Field.Description>{description}</Field.Description>
	</div>

	{#if control}
		<div class="flex shrink-0 items-center gap-3">{@render control()}</div>
	{/if}
</div>
