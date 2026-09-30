<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import ContractPage from '$lib/contract/component/page.svelte';

	const contractId = page.params.id ?? '';
</script>

<ContractPage {contractId} sections={sectionsOn('contract')} />
