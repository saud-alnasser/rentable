<script lang="ts">
	import * as Sheet from '$lib/design/primitive/sheet';
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';

	/**
	 * The side sheet every create and edit form opens in.
	 *
	 * It owns the panel, the form element and the three bands inside it — a header carrying
	 * the title, a scrolling body, and a footer holding the actions — so a form supplies its
	 * fields and its buttons and nothing else. The sheet enters from the inline-end edge,
	 * which mirrors with the locale.
	 */
	let {
		open,
		onOpenChange,
		title,
		description,
		enhance,
		children,
		actions
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** Names the record being created or edited. */
		title: string;
		/** Optional line under the title, for a form whose purpose is not obvious from it. */
		description?: string;
		/** The form's submit handler, applied to the form element as an action. */
		enhance: Action<HTMLFormElement>;
		/** The fields, laid out by the form. */
		children: Snippet;
		/** The buttons, rendered in the footer in the order given. */
		actions: Snippet;
	} = $props();
</script>

<Sheet.Root bind:open={() => open, onOpenChange}>
	<Sheet.Content class="w-full sm:max-w-lg">
		<!-- novalidate: the browser cannot express a rule that normalizes before it matches, so
		     its constraint check would refuse a stored value that the form is able to repair.
		     validation is the schema's, and its messages are the translated ones. -->
		<form method="POST" use:enhance novalidate class="flex min-h-0 flex-1 flex-col">
			<Sheet.Header>
				<Sheet.Title class="capitalize">{title}</Sheet.Title>
				{#if description}
					<Sheet.Description>{description}</Sheet.Description>
				{/if}
			</Sheet.Header>

			<div class="app-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
				{@render children()}
			</div>

			<Sheet.Footer>
				{@render actions()}
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
