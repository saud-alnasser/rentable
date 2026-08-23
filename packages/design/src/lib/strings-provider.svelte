<script lang="ts">
	/**
	 * The one thing a consumer of this package has to render, and it renders it once.
	 *
	 * `@rentable/design/strings.js` is where the contract itself is written down, along with why
	 * the words and the direction arrive together. This file is only how they get in.
	 *
	 * **The context value is two getters rather than the props themselves**, and that is what
	 * makes a language switch reach a packaged component at all. `setContext` runs once, during
	 * this component's initialisation, so a plain object written there freezes the words that
	 * were current at startup. A getter is evaluated where it is read instead, which is inside
	 * the reader's own template, so the reader takes a dependency on this component's props and
	 * re-renders with them.
	 */
	import { DESIGN_CONTRACT, type DesignDirection, type DesignStrings } from '#lib/strings.js';
	import { setContext, type Snippet } from 'svelte';

	let {
		strings,
		direction,
		children
	}: { strings: DesignStrings; direction: DesignDirection; children: Snippet } = $props();

	setContext(DESIGN_CONTRACT, {
		get strings() {
			return strings;
		},
		get direction() {
			return direction;
		}
	});
</script>

{@render children()}
