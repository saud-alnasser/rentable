<script lang="ts">
	import { onMount } from 'svelte';

	import { createScreen } from './screen';
	import { select, type Selection, type State } from './state';

	/**
	 * The bar staging is stepped through from: the state on screen, its place, what to look at, and
	 * the language and appearance it is drawn in.
	 *
	 * **Deliberately unlike the product**, as `../switcher.svelte` is, so it is never read as part
	 * of what is being looked at. Mounted on `document.body` by `./host.ts`, outside the app's own
	 * tree, so nothing in the app draws or knows it.
	 */
	let {
		states,
		current,
		selection,
		failed: failedOnBoot = null
	}: {
		states: State[];
		current: State | undefined;
		selection: Selection;
		/** why the state's records could not be written, when they could not. */
		failed?: string | null;
	} = $props();

	const index = $derived(current ? states.indexOf(current) : -1);
	// why reaching the state stopped: its records on boot, or a step on screen after it.
	let stepFailed = $state<string | null>(null);
	const failed = $derived(failedOnBoot ?? stepFailed);

	// where the bar sits, moved out of the way of whatever is being looked at. Kept apart from the
	// selection because moving it changes nothing on screen, so it reloads nothing.
	const DOCK = 'stage:dock';
	let top = $state(readDock());

	function readDock() {
		try {
			return localStorage.getItem(DOCK) !== 'bottom';
		} catch {
			return false;
		}
	}

	const flip = () => {
		top = !top;
		localStorage.setItem(DOCK, top ? 'top' : 'bottom');
	};
	let reached = $state(false);

	const step = (offset: number) => {
		const next = states[(index + offset + states.length) % states.length];

		select({ state: next.id }, next.route);
	};

	// the app is ready once its shell has drawn a page: the command palette's control is in the
	// title bar of every signed-in screen and of none of the startup screens.
	const ready = async () => {
		const screen = createScreen(30_000);
		await screen.find('main');
		await screen.find('header button[aria-label]');
	};

	onMount(() => {
		const state = current;
		if (!state) return;

		const run = async () => {
			await ready();

			const screen = createScreen();
			if (window.location.pathname !== state.route) await screen.go(state.route);
			await state.steps?.(screen);
			reached = true;
		};

		run().catch((error: unknown) => {
			stepFailed = error instanceof Error ? error.message : String(error);
		});
	});

	// bits-ui dismisses a layer on a `pointerdown` outside it, and this bar is outside every one of
	// them: keeping its events off the document keeps the staged dialog open while the bar is used.
	const onpointerdown = (event: PointerEvent) => event.stopPropagation();
	const onmousedown = (event: MouseEvent) => event.preventDefault();
</script>

<div
	dir="ltr"
	role="toolbar"
	tabindex="-1"
	aria-label="stage"
	data-state={current?.id}
	data-status={failed ? 'failed' : reached ? 'reached' : 'reaching'}
	{onpointerdown}
	{onmousedown}
	class="pointer-events-auto fixed {top
		? 'top-1.5'
		: 'bottom-3'} left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-1 rounded-2xl border-2 border-dashed border-fuchsia-500 bg-neutral-950/95 p-1.5 font-mono text-xs text-fuchsia-200 shadow-overlay backdrop-blur-sm"
>
	<div class="flex items-center gap-1">
		<span class="px-2 whitespace-nowrap text-fuchsia-400/70 uppercase">stage</span>

		<button
			type="button"
			tabindex="-1"
			aria-label="previous state"
			class="rounded-full bg-fuchsia-500/15 px-3 py-1.5 leading-none text-fuchsia-300 hover:bg-fuchsia-500 hover:text-white"
			onclick={() => step(-1)}>←</button
		>

		<span
			class="min-w-56 truncate rounded-full bg-fuchsia-500 px-3 py-1.5 text-center font-semibold text-white"
		>
			{index + 1}/{states.length} · {current?.label ?? 'no states'}
		</span>

		<button
			type="button"
			tabindex="-1"
			aria-label="next state"
			class="rounded-full bg-fuchsia-500/15 px-3 py-1.5 leading-none text-fuchsia-300 hover:bg-fuchsia-500 hover:text-white"
			onclick={() => step(1)}>→</button
		>

		<span class="mx-1 h-4 w-px bg-fuchsia-500/40"></span>

		<button
			type="button"
			tabindex="-1"
			aria-label="move the bar"
			class="rounded-full bg-fuchsia-500/15 px-2.5 py-1.5 leading-none text-fuchsia-300 hover:bg-fuchsia-500 hover:text-white"
			onclick={flip}>{top ? '↓' : '↑'}</button
		>

		{#each [['en', 'EN'], ['ar', 'AR']] as const as [language, label] (language)}
			<button
				type="button"
				tabindex="-1"
				aria-pressed={selection.language === language}
				class="rounded-full px-2.5 py-1.5 leading-none {selection.language === language
					? 'bg-fuchsia-500 text-white'
					: 'bg-fuchsia-500/15 text-fuchsia-300 hover:bg-fuchsia-500/40'}"
				onclick={() => select({ language })}>{label}</button
			>
		{/each}

		{#each [['light', 'light'], ['dark', 'dark']] as const as [appearance, label] (appearance)}
			<button
				type="button"
				tabindex="-1"
				aria-pressed={selection.appearance === appearance}
				class="rounded-full px-2.5 py-1.5 leading-none {selection.appearance === appearance
					? 'bg-fuchsia-500 text-white'
					: 'bg-fuchsia-500/15 text-fuchsia-300 hover:bg-fuchsia-500/40'}"
				onclick={() => select({ appearance })}>{label}</button
			>
		{/each}
	</div>

	{#if failed}
		<p class="px-2 pb-0.5 text-rose-300">step failed: {failed}</p>
	{:else if current}
		<p class="px-2 pb-0.5 text-fuchsia-100/90">
			<span class="text-fuchsia-400/70">{reached ? 'look' : 'reaching…'}</span>
			{current.look}
		</p>
	{/if}
</div>
