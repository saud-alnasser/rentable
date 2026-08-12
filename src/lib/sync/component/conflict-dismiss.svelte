<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Leaving a conflict unanswered, as the corner control of whichever card hosts the conflict.
	 *
	 * It lives out here rather than on the panel because it belongs to the screen and not to the
	 * question: the panel is the answer, and this is the way past it. Two screens raise a
	 * conflict, so it is one component rather than a copy each — the same reason their wording
	 * comes from one table.
	 *
	 * @see getConflictPresentation for the wording of the answers it declines to give
	 */
	let {
		label,
		disabled = false,
		onDismiss
	}: {
		/** What leaving means on this screen — deferring the question, or cancelling the link. */
		label: string;
		disabled?: boolean;
		onDismiss: () => void;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				class="cursor-pointer"
				{disabled}
				aria-label={label}
				onclick={onDismiss}
			>
				<XIcon class="size-4" />
				<span class="sr-only">{label}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>{label}</Tooltip.Content>
</Tooltip.Root>
