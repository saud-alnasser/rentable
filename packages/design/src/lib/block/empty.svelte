<script lang="ts" module>
	/**
	 * Which of the three things a region with nothing in it is saying.
	 *
	 * - `nothing-yet`: the set holds nothing, and the words say what it will hold. Its act is the
	 *   set's create, where the set can be added to.
	 * - `no-match`: the set holds records and a search or a filter narrowed all of them away. Its
	 *   act clears what narrowed it.
	 * - `not-found`: the one record, or the page, that was asked for does not exist. Its act is the
	 *   way back.
	 */
	export type EmptyKind = 'nothing-yet' | 'no-match' | 'not-found';
</script>

<script lang="ts">
	import * as Empty from '#lib/primitive/empty/index.js';
	import { cn } from '#lib/tailwind.js';
	import type { Snippet } from 'svelte';

	/**
	 * The one treatment for a region with nothing to show.
	 *
	 * **An empty region leads.** It says what the region is for and offers the act that fills it,
	 * or the act that undoes what emptied it, so a reader is never left at a blank with no next
	 * step. The three kinds never read the same: a set with nothing in it yet and a search that
	 * matched nothing are different situations with different ways out, and one sentence for both
	 * (the old "no results") told the reader neither.
	 *
	 * **The words are the caller's.** What a set will hold is the concept's to say, and this
	 * package names no concept, so every sentence arrives as a prop and the block reads nothing
	 * from the string contract. What it owns is the arrangement: a title, an optional line under
	 * it, and the one act beneath both.
	 */
	let {
		kind,
		title,
		description,
		action,
		class: className
	}: {
		/** Which situation this is. Marked on the region, so a test and a stylesheet can tell. */
		kind: EmptyKind;
		/** What the region says first: what it will hold, that nothing matched, or that it is gone. */
		title: string;
		/** One line under the title, where there is more to say. */
		description?: string;
		/** The one act that leads out: create, clear, or go back. */
		action?: Snippet;
		/** Classes for the region, so it fills the space the content would have. */
		class?: string;
	} = $props();
</script>

<Empty.Root data-empty={kind} class={cn('h-full gap-4', className)}>
	<!-- polite rather than silent: a search that empties the set replaces the records under the
	     reader's cursor, and a reader who cannot see that is told what happened. -->
	<Empty.Header aria-live="polite">
		<!-- the title is a heading, raised to sentence case as every heading is; the line under it is a
		     description, and reads as written, in lower case, as every description does. Raising
		     only its first letter would leave its second sentence lower case beside it. -->
		<Empty.Title class="text-base first-letter:uppercase">{title}</Empty.Title>
		{#if description}
			<Empty.Description>{description}</Empty.Description>
		{/if}
	</Empty.Header>

	{#if action}
		<Empty.Content>
			{@render action()}
		</Empty.Content>
	{/if}
</Empty.Root>
