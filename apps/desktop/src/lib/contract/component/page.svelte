<script lang="ts">
	import { page } from '$app/state';
	import type { Section } from '$lib/feature/surface';
	import ContractDetails from '$lib/contract/component/details.svelte';
	import { contractSectionOf } from '$lib/contract/section';

	/**
	 * A contract's page at its own address: the details, opened on the section the address names.
	 * Every section the page has is read from the address, so each one, history included, is a
	 * place a link can open. *The route read it until effort 840's ticket 34, which holds a route
	 * to components and the composition root.*
	 */
	let {
		contractId,
		sections
	}: {
		contractId: string;
		/** what is contributed to a contract's page, handed over by the route. */
		sections: Section<'contract'>[];
	} = $props();

	const section = $derived(contractSectionOf(page.url));
</script>

<ContractDetails {contractId} {section} {sections} />
