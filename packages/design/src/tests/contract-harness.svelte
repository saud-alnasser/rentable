<script lang="ts">
	/**
	 * Scaffolding, not a test: a component that reads the contract cannot be rendered on its own,
	 * so varying what the contract supplies needs something that renders the provider and takes
	 * the provider's props.
	 */
	import { DesignProvider, type DesignDirection, type DesignStrings } from '#lib/strings.js';
	import Contract from './contract.svelte';

	let { strings, direction }: { strings: DesignStrings; direction: DesignDirection } = $props();
</script>

<DesignProvider {strings} {direction}>
	<Contract />
</DesignProvider>
