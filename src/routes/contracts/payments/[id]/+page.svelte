<script lang="ts">
	import { page } from '$app/state';
	import ContractPaymentsDataView from '$lib/resources/contracts/components/contract-payments-data-view.svelte';

	const contractId = Number(page.params.id);
</script>

<div class="flex flex-col gap-3 p-5">
	<ContractPaymentsDataView {contractId} />
</div>
