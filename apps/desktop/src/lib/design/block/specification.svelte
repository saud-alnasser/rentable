<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/** One line of a record's specification. */
	export type SpecificationEntry = {
		/** The word the reader scans for. */
		label: string;
		/** The datum, as text — or as a snippet where the concept renders it itself. */
		value: string | Snippet;
	};
</script>

<script lang="ts">
	import { cn } from '@rentable/design/tailwind.js';

	/**
	 * A record's fields, read as a specification.
	 *
	 * A fixed label column with the values aligned down the page, and one hairline between rows.
	 * The rule is the only separation kept: *Use fewer borders* argues for dropping a border
	 * where a fill or a colour step already separates, and here nothing else does — an unruled
	 * list at this row height reads as loose text rather than as a specification. The tiles this
	 * replaces used a border *and* a fill for the same job.
	 *
	 * The label carries less contrast than the value and the same size. This is _Labels are a
	 * last resort_ read against a dark palette: the section's own instruction is a darker label
	 * and a slightly lighter value, which inverts here, and the book says nothing about dark
	 * interfaces. What survives the inversion is that the two are told apart by contrast alone —
	 * so the label stops shouting in small tracked capitals and the datum, which is what the
	 * reader came for, is the brighter of the two.
	 *
	 * Values wrap rather than truncate. A contract's government identifier is a UUID, and it was
	 * truncation that ruled out the denser treatments this one was chosen over.
	 */
	let {
		entries,
		class: className
	}: {
		/** The fields, in the order they are read. */
		entries: SpecificationEntry[];
		class?: string;
	} = $props();
</script>

<dl class={cn('text-start text-sm', className)}>
	{#each entries as entry (entry.label)}
		<div class="flex items-baseline gap-6 border-b border-border/40 py-2 last:border-0">
			<dt class="w-40 shrink-0 text-muted-foreground capitalize">{entry.label}</dt>
			<dd class="min-w-0 font-medium break-words text-foreground">
				{#if typeof entry.value === 'string'}
					{entry.value}
				{:else}
					{@render entry.value()}
				{/if}
			</dd>
		</div>
	{/each}
</dl>
