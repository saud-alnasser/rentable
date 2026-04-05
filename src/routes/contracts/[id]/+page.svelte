<script lang="ts">
	import { page } from '$app/state';
	import ContractDetails from '$lib/resources/contracts/components/contract-details.svelte';

	type ContractDetailsSection = 'overview' | 'units' | 'payments';

	const contractId = Number(page.params.id);
	let initialSection: ContractDetailsSection = $derived.by(() => {
		const section = page.url.searchParams.get('section');

		if (section === 'units' || section === 'payments') {
			return section;
		}

		return 'overview';
	});
</script>

<div class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 px-5 pt-5 pb-24 sm:pb-32">
	<ContractDetails {contractId} {initialSection} />
</div>
