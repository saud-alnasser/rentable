<script lang="ts">
	/**
	 * The contract form, as the host sees it: something that, once opened, writes a contract and
	 * says so through `onCreated`.
	 *
	 * Scaffolding rather than a test. What the real form writes, and how it validates, is its own
	 * tests' business; what the host does once a contract exists is what `landing.svelte.test.ts`
	 * reads, and filling a whole contract form to reach it would test the form instead.
	 */
	let {
		open,
		onCreated
	}: {
		open: boolean;
		onCreated?: (created: { id: string }) => void;
	} = $props();

	$effect(() => {
		if (open) {
			onCreated?.({ id: 'contract-9' });
		}
	});
</script>
