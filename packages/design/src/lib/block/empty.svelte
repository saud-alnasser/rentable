<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/**
	 * Which of the four things a region with nothing in it is saying.
	 *
	 * - `nothing-yet`: the set holds nothing, and the words say what it will hold. Its act is the
	 *   set's create, where the set can be added to.
	 * - `no-match`: the set holds records and a search or a filter narrowed all of them away. Its
	 *   act clears what narrowed it.
	 * - `not-found`: the one record, or the page, that was asked for does not exist. Its act is the
	 *   way back.
	 * - `failed`: the read of what belongs here failed, so whether there is anything is not known.
	 *   Its act reads it again.
	 */
	export type EmptyKind = 'nothing-yet' | 'no-match' | 'not-found' | 'failed';

	/** What every kind takes. */
	type EmptyRegion = {
		/** Classes for the region, so it fills the space the content would have. */
		class?: string;
	};

	/**
	 * What the block takes, by kind. The failed kind takes no words, since a read that failed reads
	 * the same wherever it fails, and it cannot be drawn without the act that reads again.
	 */
	export type EmptyProps = EmptyRegion &
		(
			| {
					/** Which situation this is. Marked on the region, so a test and a stylesheet can tell. */
					kind: Exclude<EmptyKind, 'failed'>;
					/**
					 * What the region says first: what it will hold, that nothing matched, or that it is
					 * gone.
					 */
					title: string;
					/** One line under the title, where there is more to say. */
					description?: string;
					/** The one act that leads out: create, clear, or go back. */
					action?: Snippet;
			  }
			| {
					kind: 'failed';
					/** Run the read that failed again. The block's one act, *try again*, calls it. */
					onRetry: () => void;
			  }
		);
</script>

<script lang="ts">
	import { Button } from '#lib/primitive/button/index.js';
	import * as Empty from '#lib/primitive/empty/index.js';
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * The one treatment for a region with nothing to show.
	 *
	 * **An empty region leads.** It says what the region is for and offers the act that fills it,
	 * or the act that undoes what emptied it, so a reader is never left at a blank with no next
	 * step. The four kinds never read the same: a set with nothing in it yet and a search that
	 * matched nothing are different situations with different ways out, and one sentence for both
	 * (the old "no results") told the reader neither.
	 *
	 * **The words are the caller's, but for a failed read.** What a set will hold is the concept's
	 * to say, and this package names no concept, so those sentences arrive as props. A read that
	 * failed names no concept either: it says the same in a list, a record and the landing screen,
	 * so the failed kind reads its title, its line and its act from the string contract, and the
	 * caller hands it only what runs the read again ([[rules/interface]], *Empty* and *Error*).
	 * What the block owns is the arrangement: a title, an optional line under it, and the one act
	 * beneath both.
	 */
	let props: EmptyProps = $props();

	const contract = useDesignContract();

	const title = $derived(props.kind === 'failed' ? contract.strings.readFailed : props.title);
	const description = $derived(
		props.kind === 'failed' ? contract.strings.readFailedDescription : props.description
	);
	const action = $derived(props.kind === 'failed' ? retryAct : props.action);
</script>

<!-- a failed read's one act: the read again, in words, as every empty act is drawn. -->
{#snippet retryAct()}
	<Button
		variant="outline"
		size="sm"
		data-empty-retry
		onclick={() => {
			if (props.kind === 'failed') {
				props.onRetry();
			}
		}}
	>
		<RefreshCwIcon />
		{contract.strings.tryAgain}
	</Button>
{/snippet}

<Empty.Root data-empty={props.kind} class={cn('h-full gap-4', props.class)}>
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
