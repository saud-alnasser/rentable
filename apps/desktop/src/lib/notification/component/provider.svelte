<script lang="ts">
	import { Toaster } from '@rentable/design/primitive/sonner/index.js';
	import { browserAppearance } from '$lib/platform/appearance';

	let { children } = $props();

	// the appearance being drawn, so a toast is light in light and dark in dark, and follows the
	// system with everything else while the setting is system.
	const resolved = browserAppearance().resolved;

	// the shared duration is a success's and a warning's. An error stands until it is closed and an
	// offer stays longer, each set where it is raised; the side the toaster stands on is the
	// packaged toaster's own, read from the design contract.
</script>

<Toaster duration={1500} theme={$resolved} />

{@render children?.()}
