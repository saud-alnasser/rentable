<script lang="ts">
	import { back } from '@rentable/design/back.svelte.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	/**
	 * Back, on a record's own surface.
	 *
	 * It returns to the screen that opened the record rather than to a fixed place — the same
	 * record is reached from a directory, from another record, and from the palette, and only
	 * one of those is where the reader came from. The fallback is for the openings that have
	 * no previous screen: a link, a fresh start, or a return from a record just deleted.
	 */
	let {
		fallback
	}: {
		/** where back goes when the reader has been nowhere else — the concept's directory. */
		fallback: string;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				aria-label={$LL.common.ui.previous()}
				class="shrink-0 rounded-full bg-secondary"
				onclick={() => back.go(fallback)}
			>
				<!-- the arrow mirrors with the locale: back is towards where reading starts. -->
				<ArrowLeftIcon class="size-4 rtl:rotate-180" />
				<span class="sr-only">{$LL.common.ui.previous()}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>{$LL.common.ui.previous()}</Tooltip.Content>
</Tooltip.Root>
