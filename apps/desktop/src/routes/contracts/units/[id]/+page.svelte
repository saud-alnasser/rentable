<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import ContractDetails from '$lib/contract/component/details.svelte';

	const contractId = page.params.id ?? '';
</script>

<ContractDetails {contractId} section="units" sections={sectionsOn('contract')} />
