<script lang="ts" module>
	/**
	 * How long a load has to run before anything says so.
	 *
	 * A local read usually answers well inside this, and a skeleton that flashes up for a frame
	 * and vanishes reads as a flicker rather than as a wait.
	 */
	export const LOADING_DELAY = 200;

	/**
	 * How long a skeleton stays once it has been shown, however soon the content arrives.
	 *
	 * A skeleton swapped out a moment after it appeared is the same flicker the delay prevents,
	 * one step later.
	 */
	export const LOADING_HOLD = 300;
</script>

<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import type { Snippet } from 'svelte';

	/**
	 * The one loading treatment: a skeleton shaped like what it stands in for.
	 *
	 * **The shape is the surface's, and the timing is this block's.** A list knows what its rows
	 * look like and a record knows what its header looks like, so each hands in a snippet drawing
	 * that shape. What no surface decides for itself is when it appears: never before
	 * {@link LOADING_DELAY}, and once shown, for at least {@link LOADING_HOLD}. A load that settles
	 * inside the delay draws no skeleton at all.
	 *
	 * **The content is rendered here too**, because holding the skeleton means holding the content
	 * back, and only the block that owns the timer knows when that ends. Before the delay has run
	 * out nothing is drawn but an empty region marked busy.
	 */
	let {
		loading,
		skeleton,
		children,
		label,
		class: className
	}: {
		/** Whether what this stands in for is still on its way. */
		loading: boolean;
		/** The shape of the content, drawn while it loads. */
		skeleton: Snippet;
		/** The content, drawn once it has loaded and the skeleton has had its hold. */
		children?: Snippet;
		/** What a screen reader hears while the skeleton stands. The contract's `loading` otherwise. */
		label?: string;
		/** Classes for the region that stands in for the content, so it fills the same space. */
		class?: string;
	} = $props();

	const contract = useDesignContract();

	let shown = $state(false);
	// when the skeleton appeared, which is what the hold is counted from. Not state: nothing
	// draws from it, and reading it inside the effect must not subscribe the effect to it.
	let shownAt = 0;

	$effect(() => {
		if (loading) {
			// already standing: it stays for as long as the load runs, however long that is.
			if (shown) return;

			const timer = setTimeout(() => {
				shown = true;
				shownAt = Date.now();
			}, LOADING_DELAY);

			return () => clearTimeout(timer);
		}

		if (!shown) return;

		const remaining = LOADING_HOLD - (Date.now() - shownAt);

		if (remaining <= 0) {
			shown = false;

			return;
		}

		const timer = setTimeout(() => {
			shown = false;
		}, remaining);

		return () => clearTimeout(timer);
	});
</script>

{#if shown}
	<div class={className} role="status" aria-busy="true" data-loading="skeleton">
		<span class="sr-only">{label ?? contract.strings.loading}</span>
		<div aria-hidden="true" class="contents">
			{@render skeleton()}
		</div>
	</div>
{:else if loading}
	<div class={className} aria-busy="true" data-loading="waiting"></div>
{:else}
	{@render children?.()}
{/if}
