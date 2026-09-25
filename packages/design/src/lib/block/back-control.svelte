<script lang="ts">
	import { back } from '#lib/back.svelte.js';
	import { Button } from '#lib/primitive/button/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { useDesignContract } from '#lib/strings.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	/**
	 * Back, on every surface that has one: a record's page, and each step of the way in.
	 *
	 * On a record it returns to the screen that opened the record rather than to a fixed place:
	 * the same record is reached from a directory, from another record, and from the palette, and
	 * only one of those is where the reader came from. The fallback is for the openings that have
	 * no previous screen: a link, a fresh start, or a return from a record just deleted.
	 *
	 * **A walk decides for itself where back goes**, because a step of it is not a screen on the
	 * trail: back from the second step of a walk is the first step, on the same address. So a
	 * surface that is a walk hands in `onclick` instead of a fallback, and the control is
	 * otherwise the same control, drawn the same way in the same place.
	 */
	let {
		fallback,
		onclick,
		label,
		labelled = false
	}: (
		| {
				/** where back goes when the reader has been nowhere else: the concept's directory. */
				fallback: string;
				onclick?: undefined;
		  }
		| {
				fallback?: undefined;
				/** what back does on a surface that decides it, in place of the trail. */
				onclick: () => void;
		  }
	) & {
		/** what the control is called, where the surface has its own word; the contract's otherwise. */
		label?: string;
		/**
		 * Whether the control says its name beside the arrow rather than in a tooltip. Set where the
		 * way back is the one act of a surface with nothing else on it, as a page that is not there
		 * is (`not-found.svelte`): the reader's eye lands on the sentence in the middle, and the
		 * way out is beneath it in words rather than in a corner.
		 */
		labelled?: boolean;
	} = $props();

	const contract = useDesignContract();

	const name = $derived(label ?? contract.strings.previous);

	function goBack() {
		if (onclick) {
			onclick();

			return;
		}

		if (fallback !== undefined) {
			void back.go(fallback);
		}
	}
</script>

{#if labelled}
	<Button variant="outline" size="sm" data-back-control onclick={goBack}>
		<!-- the arrow mirrors with the locale: back is towards where reading starts. -->
		<ArrowLeftIcon class="rtl:rotate-180" />
		{name}
	</Button>
{:else}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					aria-label={name}
					class="shrink-0 rounded-full bg-secondary"
					data-back-control
					onclick={goBack}
				>
					<!-- the arrow mirrors with the locale: back is towards where reading starts. -->
					<ArrowLeftIcon class="size-4 rtl:rotate-180" />
					<span class="sr-only">{name}</span>
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>{name}</Tooltip.Content>
	</Tooltip.Root>
{/if}
