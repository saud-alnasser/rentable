<script lang="ts">
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { writeDetailsToClipboard, type ClipboardDetail } from '$lib/platform/clipboard';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import FilesIcon from '@lucide/svelte/icons/files';

	/**
	 * What a record's own surface offers of the record itself: taking its details away, and
	 * starting another one from them.
	 *
	 * Both are buttons beside the surface's other controls rather than entries in a menu, so
	 * the keyboard reaches them by tabbing to where it already goes.
	 */
	let {
		details,
		onDuplicate
	}: {
		/** the record's stated details, in the order they are read on the surface. */
		details: ClipboardDetail[];
		/**
		 * open the create form pre-filled from this record.
		 *
		 * Omitted where nothing writes it, and where the copy would carry nothing: a record whose
		 * stated fields are all unique to it duplicates into the create form with one value
		 * filled in, wearing a label that promises more.
		 */
		onDuplicate?: () => void;
	} = $props();

	async function copyDetails() {
		const copied = await writeDetailsToClipboard(details);

		if (copied) {
			onMutationSuccess({ toast: { success: () => $LL.common.messages.copied() } });

			return;
		}

		onMutationError(
			{ toast: { unexpected: () => $LL.common.messages.copyFailed() } },
			new Error('the clipboard refused')
		);
	}
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				aria-label={$LL.common.actions.copyDetails()}
				class="rounded-full bg-secondary"
				onclick={copyDetails}
			>
				<CopyIcon class="size-4" />
				<span class="sr-only">{$LL.common.actions.copyDetails()}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>{$LL.common.actions.copyDetails()}</Tooltip.Content>
</Tooltip.Root>

{#if onDuplicate}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					aria-label={$LL.common.actions.duplicate()}
					class="rounded-full bg-secondary"
					onclick={onDuplicate}
				>
					<FilesIcon class="size-4" />
					<span class="sr-only">{$LL.common.actions.duplicate()}</span>
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>{$LL.common.actions.duplicate()}</Tooltip.Content>
	</Tooltip.Root>
{/if}
