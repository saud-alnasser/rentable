<script lang="ts">
	import { LL } from '$lib/i18n/i18n-svelte';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';

	/**
	 * What the shell or Turso said behind a refusal, closed until somebody asks for it.
	 *
	 * **The sentence above it is the reader's; this is the machine's.** A refusal is said in the
	 * reader's language from its reason, and the words that came back with it are in whatever
	 * language their author wrote, Turso's English included. They are kept because they are what a
	 * person quotes to somebody else, and kept closed because nobody acts on them (effort 832,
	 * requirement 23).
	 */
	let {
		detail,
		name
	}: {
		/** the words to show when opened. */
		detail: string;
		/** what the disclosure is called on its element, so a test can find the one it means. */
		name: string;
	} = $props();

	let isOpen = $state(false);
</script>

<Collapsible.Root bind:open={isOpen} data-error-detail={name}>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="link" size="sm" class="h-auto p-0 text-muted-foreground">
				{$LL.common.actions.details()}
			</Button>
		{/snippet}
	</Collapsible.Trigger>

	<Collapsible.Content>
		<!-- drawn only while open, so words nobody asked for reach neither a reader nor a screen
		     reader. `dir="auto"` because they run in their own direction whatever the reader's is. -->
		{#if isOpen}
			<p class="pt-1 text-xs text-muted-foreground" dir="auto" data-error-detail-text={name}>
				{detail}
			</p>
		{/if}
	</Collapsible.Content>
</Collapsible.Root>
