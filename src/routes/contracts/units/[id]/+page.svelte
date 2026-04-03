<script lang="ts">
	import { page } from '$app/state';
	import ContractUnitsManagement from '$lib/resources/contracts/components/contract-units-management.svelte';

	const contractId = Number(page.params.id);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 p-5">
	<ContractUnitsManagement {contractId} />
</div>
