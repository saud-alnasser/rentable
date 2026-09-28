<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The head a section of a member's sheet opens with: its name, one sentence where it needs
	 * one, and the control that acts on it where it has one.
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
		description = null,
		control = null
	}: {
		/** the section's name in the document: its legend is `<id>-legend`. */
		id: string;
		legend: string;
		/** the one sentence under the name, where the section needs one. */
		description?: string | null;
		/** the control that acts on the section, drawn at the end of the head. */
		control?: Snippet | null;
	} = $props();
</script>

<div
	class="flex justify-between gap-3 {description ? 'items-start' : 'items-center'}"
	data-list-head={id}
>
	<div class="min-w-0">
		<Field.Legend id={`${id}-legend`} variant="label" class={description ? 'mb-1' : 'mb-0'}>
			{legend}
		</Field.Legend>
		{#if description}
			<Field.Description>{description}</Field.Description>
		{/if}
	</div>

	{#if control}
		<div class="flex shrink-0 items-center gap-3">{@render control()}</div>
	{/if}
</div>
