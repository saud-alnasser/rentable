<script lang="ts" module>
	/**
	 * How tall a contract's tile is, in pixels, on every list that draws one. Measured on the
	 * development workspace in both languages (ticket 15 of effort 846): the padding, the heading
	 * line, three fact lines of 20 px four apart, and the two money lines of 18 px beside the ring.
	 * A line that drops its fixed leading makes the Arabic tile taller than this, and the list does
	 * not measure, so it would overlap the tile below.
	 */
	export const CONTRACT_TILE_HEIGHT = 184;
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import type { Contract } from '$lib/platform/database/schema';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { contractActs } from '$lib/contract/host.svelte';
	import { toContractName } from '$lib/contract/contract';
	import { toCardActions } from '$lib/act';
	import * as Cell from '$lib/design/cell';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatRecordDateRange } from '$lib/date';
	import { formatLocaleMoney, getIntlLocale } from '$lib/platform/locale';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';
	import HashIcon from '@lucide/svelte/icons/hash';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';

	/**
	 * One contract, as every surface that lists contracts renders it — the directory, a
	 * tenant's contracts, and a unit's.
	 *
	 * It is a component rather than a snippet in the directory because three surfaces render
	 * it: a contract met in a tenant's profile and one met in the directory are the same
	 * record, and a row copied per surface is where the two start to disagree. The card's
	 * address and what its link is called are here for the same reason.
	 *
	 * **It is a tile on all three**, laid in the list's grid (effort 846, requirements 18 and 19):
	 * the tenant and the status with its word on the heading line, then the facts a reader scans
	 * for, each a line under its own icon, then the money at the foot. Its height is the lists'
	 * `CONTRACT_TILE_HEIGHT`, and every line below the heading sets its own leading so that height
	 * holds in Arabic, whose font would otherwise draw each line taller and overlap the card below.
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

	// the tenant is what the card leads with, so it is what the link is called. A reader who may not
	// view tenants is answered with none (effort 838, requirement 10), and the card leads with the
	// contract's own reference instead, which the line below it then does not repeat.
	const namesTenant = $derived(contract.tenantName !== undefined);
	const label = $derived(
		namesTenant
			? contract.tenantName?.trim() || $LL.common.labels.tenant()
			: toContractName(contract, $LL.common.labels.contract())
	);

	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// the units named in the reader's own list style, which is not a comma in Arabic. Absent for a
	// reader who may not view units, and empty for a contract holding none; the line is left out
	// either way.
	const listLocale = $derived(getIntlLocale($locale));
	const unitNames = $derived(
		contract.unitNames && contract.unitNames.length > 0
			? new Intl.ListFormat(listLocale, { type: 'unit' }).format(contract.unitNames)
			: undefined
	);
</script>

<!-- a fact: the shared fact line, its text truncated and its figures aligned. -->
{#snippet fact(icon: typeof HashIcon, text: string, dir?: 'ltr')}
	<Cell.Fact {icon}>
		<span class="truncate tabular-nums" {dir}>{text}</span>
	</Cell.Fact>
{/snippet}

<RecordCard href={resolve(`/contracts/${contract.id}`)} {label} {actions} layout="tile">
	{#snippet heading()}
		<Cell.Text class="min-w-0 flex-1 truncate text-sm font-semibold" text={label} />
		<Cell.Status status={contract.status} labelled />
	{/snippet}

	{#snippet content()}
		<span class="pointer-events-none relative flex min-w-0 flex-col gap-1">
			<!-- the reference leads the card instead where no tenant is named, and is not repeated. -->
			{#if namesTenant}
				{@render fact(HashIcon, contract.govId.trim() || '—', 'ltr')}
			{/if}
			<!-- a range rather than "start → end": an arrow does not mirror in Arabic, where the
			     two dates swap and it would then point at the wrong one. -->
			{@render fact(
				CalendarRangeIcon,
				formatRecordDateRange($locale, contract.start, contract.end)
			)}
			{#if unitNames}
				{@render fact(LayoutGridIcon, unitNames)}
			{/if}
		</span>

		<span class="pointer-events-none relative mt-auto flex min-w-0 items-center gap-3">
			<!-- the ring, then the figures it is drawn from: on a tile they are read, not hovered. -->
			<Cell.Ring value={contract.paidAmount} total={contract.expectedAmount} />
			<span class="flex min-w-0 flex-1 flex-col text-xs leading-[18px] tabular-nums">
				<span class="truncate font-medium">
					<span class="sr-only">{$LL.common.labels.paymentFulfillment()}:</span>
					{formatMoney(contract.paidAmount)} / {formatMoney(contract.expectedAmount)}
				</span>
				<!-- the cost is per interval, so it carries its interval with it: a bare amount beside a
				     contract reads as what the whole contract is worth. -->
				<span class="truncate text-muted-foreground">
					{formatMoney(contract.cost)} · {intervalLabels[contract.interval]}
				</span>
			</span>
			<!-- money rather than state, and not drawn at nothing. A reader who may not view payments
			     is not told how many there are. -->
			{#if contract.paymentCount !== undefined && contract.paymentCount > 0}
				<span
					data-payment-count
					class="flex shrink-0 items-center gap-1.5 text-xs leading-5 text-money"
				>
					<BanknoteIcon class="size-3.5 shrink-0" aria-hidden="true" />
					<span class="tabular-nums">
						{$LL.contracts.card.payments({ count: contract.paymentCount })}
					</span>
				</span>
			{/if}
		</span>
	{/snippet}
</RecordCard>
