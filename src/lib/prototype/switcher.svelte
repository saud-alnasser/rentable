<script lang="ts" module>
	// one surface can be asking two independent questions at once, so each mounted bar takes
	// the row above the last rather than landing on top of it.
	const stack = $state<symbol[]>([]);
</script>

<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { onMount } from 'svelte';

	/**
	 * A floating bar for cycling between the variants of a UI prototype, so a layout question
	 * is answered by looking rather than by reading a description of it.
	 *
	 * It renders only under `dev` and is deliberately ugly: a prototype's variants come out of
	 * the tree once the question is answered, and a bar that looked like part of the product
	 * is one nobody notices was left behind.
	 *
	 * The selection survives a reload — the Rust watcher restarts the window often enough that
	 * re-picking the variant every time is most of the friction of running a prototype at all.
	 * It is kept in `localStorage` rather than the URL because this repository requires every
	 * navigation to go through `resolve()`, which takes a route id and cannot express "the same
	 * route, one search parameter different"; a desktop application has nobody to send a link
	 * to, so the URL bought nothing worth that.
	 */
	let {
		name,
		variants,
		labels,
		current = $bindable()
	}: {
		/** Names the prototype, so two of them do not share one remembered selection. */
		name: string;
		/** The variant keys, in the order the bar cycles through them. */
		variants: string[];
		/** What each variant is called, shown in the middle while it is the one on screen. */
		labels: Record<string, string>;
		/** The variant on screen. */
		current: string;
	} = $props();

	const id = Symbol();
	const row = $derived(Math.max(stack.indexOf(id), 0));

	const key = () => `prototype:${name}`;

	// read at initialisation rather than in the effect below, which would otherwise have
	// overwritten the stored value with the default before this could restore it.
	const remembered = browser ? localStorage.getItem(key()) : null;

	onMount(() => {
		if (remembered && variants.includes(remembered)) {
			current = remembered;
		}

		stack.push(id);

		return () => {
			stack.splice(stack.indexOf(id), 1);
		};
	});

	$effect(() => {
		localStorage.setItem(key(), current);
	});

	const position = () => variants.indexOf(current) + 1;

	const step = (offset: number) => {
		const index = variants.indexOf(current);

		current = variants[(index + offset + variants.length) % variants.length];
	};

	// bits-ui dismisses a modal from a bubble-phase `pointerdown` on the document, and this
	// bar sits outside the surface it switches, so a click on it read as a click outside and
	// closed the thing being looked at. an open modal also puts `pointer-events: none` on the
	// body, which is what `pointer-events-auto` below takes back. stopping the event here keeps
	// it off the document; suppressing the default keeps focus where it was, which is what the
	// focus scope inside the surface would otherwise fight over.
	const onpointerdown = (event: PointerEvent) => {
		event.stopPropagation();
	};

	const onmousedown = (event: MouseEvent) => {
		event.preventDefault();
	};
</script>

{#if dev}
	<div
		dir="ltr"
		role="toolbar"
		tabindex="-1"
		aria-label="prototype variants"
		{onpointerdown}
		{onmousedown}
		style="bottom: {1 + row * 3.25}rem"
		class="pointer-events-auto fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-dashed border-fuchsia-500 bg-neutral-950/95 p-1 font-mono text-xs text-fuchsia-200 shadow-2xl backdrop-blur-sm"
	>
		<span class="px-2 text-[10px] whitespace-nowrap text-fuchsia-400/70 uppercase">{name}</span>

		<button
			type="button"
			tabindex="-1"
			aria-label="previous variant"
			class="rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-sm leading-none text-fuchsia-300 transition-colors hover:bg-fuchsia-500 hover:text-white active:bg-fuchsia-400"
			onclick={() => step(-1)}>←</button
		>

		<span
			class="min-w-40 rounded-full bg-fuchsia-500 px-3 py-1.5 text-center font-bold text-white shadow-[0_0_12px] shadow-fuchsia-500/50"
		>
			{position()}/{variants.length} · {labels[current]}
		</span>

		<button
			type="button"
			tabindex="-1"
			aria-label="next variant"
			class="rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-sm leading-none text-fuchsia-300 transition-colors hover:bg-fuchsia-500 hover:text-white active:bg-fuchsia-400"
			onclick={() => step(1)}>→</button
		>
	</div>
{/if}
