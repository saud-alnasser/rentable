<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import type { Contract } from '$lib/platform/database/schema';
	import * as Cell from '$lib/design/cell';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';
	import CashIcon from '@tabler/icons-svelte/icons/cash-banknote';
	import { recordCard } from '$lib/design/block/list.svelte';
	import { cn } from '$lib/design/tailwind';

	/**
	 * One contract, as every surface that lists contracts renders it — the directory, a
	 * tenant's contracts, and a unit's.
	 *
	 * It is a component rather than a snippet in the directory because three surfaces render
	 * it: a contract met in a tenant's profile and one met in the directory are the same
	 * record, and a row copied per surface is where the two start to disagree.
	 */
	let { contract }: { contract: Awaited<ReturnType<typeof api.contract.getMany>>[number] } =
		$props();

	const intervalLabels = $derived<Record<Contract['interval'], string>>({
		'1m': $LL.contracts.intervals.monthly(),
		'3m': $LL.contracts.intervals.quarterly(),
		'6m': $LL.contracts.intervals.semiAnnual(),
		'12m': $LL.contracts.intervals.annual()
	});

	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
</script>

<a
	href={resolve(`/contracts/${contract.id}`)}
	class={cn(
		'flex h-full items-center gap-3 px-4 hover:bg-muted/40 focus-visible:bg-muted/40 active:bg-muted/60',
		recordCard
	)}
>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
		<span class="truncate text-sm font-medium">
			{contract.tenantName?.trim() || $LL.common.labels.tenant()}
		</span>
		<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
			<span class="truncate tabular-nums">{contract.govId.trim() || '—'}</span>
			<span aria-hidden="true">&middot;</span>
			<!-- a range rather than "start → end": an arrow does not mirror in Arabic, where the
			     two dates swap and it would then point at the wrong one. -->
			<span class="truncate tabular-nums">
				<Cell.Date value={contract.start} /> – <Cell.Date value={contract.end} />
			</span>
		</span>
	</span>

	<span class="flex shrink-0 items-center gap-3">
		<!-- money rather than state: this figure sits beside a status glyph, and the two wore the
		     same tone while meaning different things by it. Quiet at nothing, as every count on a
		     row is — a contract with no payments has no money to report. -->
		<Cell.Count
			icon={CashIcon}
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
</a>
