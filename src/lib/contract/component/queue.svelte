<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Contract } from '$lib/platform/database/schema';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import List from '$lib/design/block/list.svelte';
	import { Progress } from '$lib/design/primitive/progress';
	import { useListContracts } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { untrack } from 'svelte';
	import ContractForm from './form.svelte';

	type ContractRecord = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	/** A rank of the queue: every contract sharing one status, under that status's name. */
	type AttentionGroup = { key: Contract['status']; status: Contract['status'] };

	let search = $state('');
	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);

	const contractsQuery = useListContracts(() => search);
	const contracts = $derived(contractsQuery.data ?? []);

	const openCreateContractForm = () => {
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed. opening is untracked
	// because it advances the render key by reading it, and an effect that reads what it
	// writes never settles.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		untrack(openCreateContractForm);
		void goto(resolve('/contracts'), { replaceState: true, noScroll: true, keepFocus: true });
	});

	const groupOf = (contract: ContractRecord): AttentionGroup => ({
		key: contract.status,
		status: contract.status
	});

	// both figures are read from the materialized aggregates rather than summed from payment
	// rows, so the row's cost does not grow with a contract's payment history (ADR 0006). The
	// guard is against dividing by zero, not a case the domain produces.
	const fulfilledPercent = (contract: ContractRecord) =>
		contract.expectedAmount > 0
			? Math.min((contract.paidAmount / contract.expectedAmount) * 100, 100)
			: 0;
</script>

<List
	data={contracts}
	bind:search
	isLoading={contractsQuery.isLoading}
	isFetching={contractsQuery.isFetching}
	{groupOf}
	onCreate={openCreateContractForm}
>
	{#snippet groupHeader(group: AttentionGroup)}
		<div class="flex h-full items-center border-b bg-background px-4">
			<Cell.Status status={group.status} />
		</div>
	{/snippet}

	{#snippet record(contract: ContractRecord)}
		{@const percent = Math.round(fulfilledPercent(contract))}
		<a
			href={resolve(`/contracts/${contract.id}`)}
			class="flex h-full items-center gap-4 border-b px-4 hover:bg-muted/40"
		>
			<span class="min-w-0 flex-1 truncate text-sm font-medium">
				{contract.tenantName?.trim() || $LL.common.labels.tenant()}
			</span>

			<!-- the bar gives room back to the name as the window narrows rather than switching
			at a breakpoint: the list sits inside the shell's content area, whose width the
			sidebar moves independently of the viewport's. -->
			<span
				class="flex max-w-40 flex-[1_1_6rem] items-center gap-2"
				aria-label={$LL.contracts.payments.percentFulfilled({ percent: String(percent) })}
			>
				<Progress value={percent} class="h-1.5 flex-1" />
				<span class="w-9 shrink-0 text-end text-xs text-muted-foreground tabular-nums">
					{percent}%
				</span>
			</span>

			<span class="shrink-0 text-xs text-muted-foreground">
				<Cell.Date value={contract.end} />
			</span>
		</a>
	{/snippet}
</List>

{#key contractFormRenderKey}
	<ContractForm
		open={isContractFormOpen}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				contractFormRenderKey += 1;
			}

			isContractFormOpen = isOpen;
		}}
		value={undefined}
	/>
{/key}
