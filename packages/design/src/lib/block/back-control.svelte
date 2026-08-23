<script lang="ts">
	import { back } from '#lib/back.svelte.js';
	import { Button } from '#lib/primitive/button/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { useDesignContract } from '#lib/strings.js';
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

	const contract = useDesignContract();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				aria-label={contract.strings.previous}
				class="shrink-0 rounded-full bg-secondary"
				onclick={() => back.go(fallback)}
			>
				<!-- the arrow mirrors with the locale: back is towards where reading starts. -->
				<ArrowLeftIcon class="size-4 rtl:rotate-180" />
				<span class="sr-only">{contract.strings.previous}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>{contract.strings.previous}</Tooltip.Content>
</Tooltip.Root>
