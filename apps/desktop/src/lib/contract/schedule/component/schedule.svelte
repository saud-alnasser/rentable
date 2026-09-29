<script lang="ts">
	import Loading from '@rentable/design/block/loading.svelte';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import * as Cell from '$lib/design/cell';
	import { useFetchContractSchedule } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CycleState from './cycle-state.svelte';

	/**
	 * A contract's schedule: one row per cycle across its whole period, with the day it falls due,
	 * what it costs, how much of that is paid, and its state.
	 *
	 * **It renders what the procedure allocated and allocates nothing itself** ([[rules/data]]):
	 * the cover a row shows is the one `contract.schedule` read from every payment, so it cannot
	 * come to disagree with the receipt or the outstanding figure by being worked out twice.
	 *
	 * A table rather than a list of cards: a cycle has no page to open and nothing to act on, and
	 * what a reader does here is run an eye down one column and across one row, which is what a
	 * table's headers are for. The money is the ledger's, a figure in tabular digits at the end.
	 */
	let { contractId }: { contractId: string } = $props();

	const scheduleQuery = useFetchContractSchedule(() => contractId);
	const cycles = $derived(scheduleQuery.data ?? []);
</script>

<div class="min-h-0 flex-1 overflow-y-auto">
	<Loading loading={scheduleQuery.isLoading} label={$LL.common.ui.loading()} class="flex flex-col">
		<!-- the shape of the table: its header over a few rows at the height they will take. -->
		{#snippet skeleton()}
			<div class="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<Skeleton class="h-4 w-1/3" />
				{#each { length: 4 }, row (row)}
					<Skeleton class="h-8 w-full rounded-xl" />
				{/each}
			</div>
		{/snippet}

		<div class="rounded-2xl bg-card px-4 py-2">
			<table class="w-full border-collapse text-sm" data-schedule>
				<thead>
					<tr class="border-b border-border/60 text-xs text-muted-foreground">
						<th class="w-8 py-2 text-start font-medium">
							<span class="sr-only">{$LL.contracts.schedule.columns.state()}</span>
						</th>
						<th class="py-2 text-start font-medium first-letter:uppercase">
							{$LL.contracts.schedule.columns.due()}
						</th>
						<th class="py-2 ps-4 text-end font-medium first-letter:uppercase">
							{$LL.contracts.schedule.columns.amount()}
						</th>
						<th class="py-2 ps-4 text-end font-medium first-letter:uppercase">
							{$LL.contracts.schedule.columns.covered()}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each cycles as cycle (cycle.index)}
						<tr
							class="border-b border-border/40 last:border-b-0"
							data-cycle={cycle.index}
							data-state={cycle.state}
						>
							<td class="py-3">
								<CycleState state={cycle.state} covered={cycle.covered} amount={cycle.amount} />
							</td>
							<td class="py-3 text-start" data-cycle-due>
								<Cell.Date value={cycle.due} />
							</td>
							<td class="py-3 ps-4 text-end font-medium" data-cycle-amount>
								<Cell.Money amount={cycle.amount} />
							</td>
							<!-- nothing paid is the quiet case, so a figure that is there reads louder than
							     a column of zeros. -->
							<td
								class={[
									'py-3 ps-4 text-end',
									cycle.covered > 0 ? 'text-foreground' : 'text-muted-foreground'
								]}
								data-cycle-covered
							>
								<Cell.Money amount={cycle.covered} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Loading>
</div>
