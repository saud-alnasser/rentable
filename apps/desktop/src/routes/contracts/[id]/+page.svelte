<script lang="ts">
	import { page } from '$app/state';
	import ContractDetails from '$lib/contract/component/details.svelte';
	import { contractSectionOf } from '$lib/contract/section';

	const contractId = page.params.id ?? '';

	// every section the page has is read from the address, so each one, history included, is a
	// place a link can open.
	const section = $derived(contractSectionOf(page.url));
</script>

<ContractDetails {contractId} {section} />
