<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import type { Contract } from '$lib/platform/database/schema';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { contractActs } from '$lib/contract/host.svelte';
	import { toCardActions } from '$lib/design/acts';
	import * as Cell from '$lib/design/cell';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatRecordDateRange } from '$lib/design/date';
	import { formatLocaleMoney } from '$lib/platform/locale';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';

	/**
	 * One contract, as every surface that lists contracts renders it — the directory, a
	 * tenant's contracts, and a unit's.
	 *
	 * It is a component rather than a snippet in the directory because three surfaces render
	 * it: a contract met in a tenant's profile and one met in the directory are the same
	 * record, and a row copied per surface is where the two start to disagree. The card's
	 * address and what its link is called are here for the same reason.
	 */
	let {
		contract
	}: {
		contract: Awaited<ReturnType<typeof api.contract.getMany>>[number];
	} = $props();

	// what this contract offers, projected from the one list every surface offering a contract
	// reads (`contract/acts.ts`): the card's menu, its context menu, the contract's page and the
	// command menu cannot come to differ, and a card cannot be handed none.
	const actions = $derived(toCardActions(contractActs, contract, $LL));

	const intervalLabels = $derived<Record<Contract['interval'], string>>({
		'1m': $LL.contracts.intervals.monthly(),
		'3m': $LL.contracts.intervals.quarterly(),
		'6m': $LL.contracts.intervals.semiAnnual(),
		'12m': $LL.contracts.intervals.annual()
	});

	// the tenant is what the card leads with, so it is what the link is called.
	const label = $derived(contract.tenantName?.trim() || $LL.common.labels.tenant());

	const formatMoney = (value: number) => formatLocaleMoney($locale, value);
</script>

<RecordCard href={resolve(`/contracts/${contract.id}`)} {label} {actions}>
	{#snippet content()}
		<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
			<Cell.Text class="truncate text-sm font-medium" text={label} />
			<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
				<span class="truncate tabular-nums">{contract.govId.trim() || '—'}</span>
				<span aria-hidden="true">&middot;</span>
				<!-- a range rather than "start → end": an arrow does not mirror in Arabic, where the
				     two dates swap and it would then point at the wrong one. -->
				<span class="truncate tabular-nums">
					{formatRecordDateRange($locale, contract.start, contract.end)}
				</span>
			</span>
		</span>

		<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
			<!-- money rather than state: this figure sits beside a status glyph, and the two wore the
			     same tone while meaning different things by it. Quiet at nothing, as every count on a
			     row is — a contract with no payments has no money to report. -->
			<Cell.Count
				icon={BanknoteIcon}
				count={contract.paymentCount}
				label={$LL.common.nav.payments()}
				tone={contract.paymentCount > 0 ? 'money' : 'settled'}
			/>
			<Cell.Status status={contract.status} />
			<!-- the cost is per interval, so it goes to the tooltip carrying its interval with it: a
			     bare amount beside a contract reads as what the whole contract is worth. -->
			<Cell.Fulfillment
				paid={contract.paidAmount}
				expected={contract.expectedAmount}
				note={`${formatMoney(contract.cost)} · ${intervalLabels[contract.interval]}`}
			/>
		</span>
	{/snippet}
</RecordCard>
