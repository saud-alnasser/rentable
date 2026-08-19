<script lang="ts">
	import { page } from '$app/state';
	import ContractDetails from '$lib/contract/component/details.svelte';

	const contractId = page.params.id ?? '';
</script>

<ContractDetails {contractId} initialCollection="units" />
