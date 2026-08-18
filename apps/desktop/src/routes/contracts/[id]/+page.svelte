<script lang="ts">
	import { page } from '$app/state';
	import ContractDetails, { type ContractCollection } from '$lib/contract/component/details.svelte';

	const contractId = page.params.id ?? '';
	let initialCollection: ContractCollection = $derived(
		page.url.searchParams.get('section') === 'units' ? 'units' : 'payments'
	);
</script>

<ContractDetails {contractId} {initialCollection} />
