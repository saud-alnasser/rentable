<script lang="ts">
	import { page } from '$app/state';
	import ContractPaymentsTable from '$lib/resources/contracts/components/contract-payments-table.svelte';

	const contractId = Number(page.params.id);
</script>

<div class="flex flex-col gap-3 p-5">
	<ContractPaymentsTable {contractId} />
</div>
