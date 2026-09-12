<script lang="ts">
	/**
	 * The two providers a component of the rail needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` for the reason the
	 * design package's `providers.svelte` gives: `wrapper` puts exactly one component above the
	 * subject, and a rail component needs two. Every sidebar part reads the state
	 * `Sidebar.Provider` creates, and the sidebar's own parts and the menus drawn from them read
	 * `DesignProvider`'s contract. The provider carries its own tooltip provider, so that is not a
	 * third.
	 *
	 * It takes the string contract's own props and hands them on, so a test using it as a
	 * `wrapper` passes `wrapperProps` exactly as it would to `DesignProvider` directly, and
	 * `rerender` still drives the subject's props rather than these. The application nests them
	 * the same way round: `routes/+layout.svelte` holds the first and `layout/component/frame.svelte`
	 * the second.
	 *
	 * Here rather than under `src/tests/`, which holds what belongs to the runner, because this
	 * belongs to the layout's tests the way `testing.ts` beside it does.
	 */
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import {
		DesignProvider,
		type DesignDirection,
		type DesignStrings
	} from '@rentable/design/strings.js';
	import type { Snippet } from 'svelte';

	let {
		strings,
		direction,
		children
	}: { strings: DesignStrings; direction: DesignDirection; children: Snippet } = $props();
</script>

<DesignProvider {strings} {direction}>
	<Sidebar.Provider>
		{@render children()}
	</Sidebar.Provider>
</DesignProvider>
