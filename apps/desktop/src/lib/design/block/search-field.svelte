<script lang="ts" module>
	/**
	 * How long the field waits after the last keystroke before the term becomes the search.
	 *
	 * The card grid's own value, arrived at there against real data, and now every set's: a set
	 * that answered on every keystroke would read differently from its twin on the next screen.
	 */
	export const SEARCH_DEBOUNCE_MS = 250;
</script>

<script lang="ts">
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { toSearchShortcut } from '$lib/design/list-keyboard';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { untrack } from 'svelte';

	/**
	 * The one search field, for every set a person can search.
	 *
	 * **A set searches one way, wherever it is drawn** ([[rules/interface]], *Search*): a leading
	 * glass, a wait of `SEARCH_DEBOUNCE_MS` after the last keystroke, and `/` to put the cursor in
	 * it from anywhere on the surface. The list shell, the contract's unit panes and the settings
	 * directories all draw this, so none of the three can drift from the others.
	 *
	 * **What the term matches is the set's, not the field's.** A list's read folds it in SQL and a
	 * settings directory folds it in memory, through the one comparison both use, so a term typed
	 * in Arabic-Indic digits finds what its Western spelling finds either way.
	 *
	 * It stays with this application rather than in the design package because it registers a
	 * shortcut, and a packaged component registers none ([[rules/frontend]], *Components*).
	 */
	let {
		value = $bindable(''),
		onSearch,
		class: className
	}: {
		/** The search, as the set reads it: what was typed, once the reader stopped typing. */
		value?: string;
		/**
		 * Called with the new term at the moment it becomes the search, before `value` moves.
		 *
		 * The list shell uses it to know the next result set is its own search's answer, which it
		 * draws without motion.
		 */
		onSearch?: (term: string) => void;
		class?: string;
	} = $props();

	/** what is in the field, which runs ahead of `value` by the length of the wait. */
	let typed = $state(untrack(() => value));
	/** the last search this field committed, so a search changed from outside can be told apart. */
	let committed = untrack(() => value);
	let element = $state<HTMLInputElement | null>(null);

	// a search cleared or replaced by the set (an empty state's clear, say) is shown in the field,
	// and one the field committed itself is already there.
	$effect(() => {
		const next = value;

		untrack(() => {
			if (next === committed) {
				return;
			}

			committed = next;
			typed = next;
		});
	});

	$effect(() => {
		const term = typed;

		if (term === untrack(() => committed)) {
			return;
		}

		const timeout = setTimeout(() => {
			committed = term;
			onSearch?.(term);
			value = term;
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	});

	// registered rather than listened for: the search key reaches the application's one listener,
	// and the sheet reads it from here without being told about it.
	$effect(() => shortcuts.register(toSearchShortcut(() => element?.focus())));
</script>

<div data-search-field class={cn('relative w-full sm:max-w-sm', className)}>
	<!-- the glass never mirrors: it is a picture of a lens, not a direction. -->
	<SearchIcon
		aria-hidden="true"
		class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
	/>
	<Input
		bind:ref={element}
		bind:value={typed}
		placeholder={$LL.common.table.searchPlaceholder()}
		aria-label={$LL.common.ui.search()}
		class="h-8 border-transparent bg-transparent ps-9 hover:bg-input/30"
	/>
</div>
