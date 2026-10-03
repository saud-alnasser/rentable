<script lang="ts" module>
	/**
	 * How tall a contract's tile is, in pixels, on every list that draws one, which the lists lay
	 * their grid at rather than measuring.
	 *
	 * Counted the way the member tile is (effort 846, ticket 44): the padding (32), the heading line
	 * at the control's height (32), then 12 px to the fields, three rows of fields 8 px apart, each
	 * field 8 px of padding above and below a name and a value at a fixed 20 px leading
	 * (8 + 20 + 20 + 8 = 56), then 12 px to the foot, which is the paid field at 56 with the ring
	 * beside it. 32 + 32 + 12 + (56 + 8 + 56 + 8 + 56) + 12 + 56 = 328. Three rows are counted
	 * whether or not a reader is answered every field, so every tile in a list stands at one height.
	 * It holds in Arabic only because every line sets its own leading, so a field added to the
	 * tile, or a line drawn without it, changes this figure too.
	 */
	export const CONTRACT_TILE_HEIGHT = 328;
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
	import { formatLocaleMoneyRange } from '$lib/platform/locale';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';
	import HashIcon from '@lucide/svelte/icons/hash';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import RepeatIcon from '@lucide/svelte/icons/repeat';
	import WalletIcon from '@lucide/svelte/icons/wallet';

	/**
	 * One contract, as every surface that lists contracts renders it: the directory, a tenant's
	 * contracts, and a unit's.
	 *
	 * It is a component rather than a snippet in the directory because three surfaces render
	 * it: a contract met in a tenant's profile and one met in the directory are the same
	 * record, and a row copied per surface is where the two start to disagree. The card's
	 * address and what its link is called are here for the same reason.
	 *
	 * **It is a tile on all three**, laid in the list's grid (effort 846, requirements 18 and 19),
	 * in the member card's family at the human's word of 2026-10-03 ("follow the tinted files and
	 * things like that in the records cards"): the tenant and the status with its word on the
	 * heading line, then the facts as tinted fields two across, each its glyph and its name over
	 * the value ([[contexts/desktop/components]], `Cell.Field`).
	 *
	 * **The period spans both columns**, since two dates side by side do not fit half a tile; the
	 * reference and the units share the next row, the cost per cycle and the payments the one
	 * after. A field holding nothing (no units, no payments yet) says *none*, muted, so the
	 * fields holding something lead and no zero is drawn as a figure.
	 *
	 * **The ring stands beside the paid field, at the foot**, rather than inside a field's value. A
	 * value is one line at a 20 px leading, and the ring is 36 px: drawn there it would either
	 * shrink until the figure at its centre cannot be read, or stretch the field past the height
	 * every tile counts. Beside the field it keeps its size, and sits next to the figures it is
	 * drawn from, so the arc and the amounts are read together as one reading of the money.
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
	// contract's own reference instead, which the fields below it then do not repeat.
	const namesTenant = $derived(contract.tenantName !== undefined);
	const label = $derived(
		namesTenant
			? contract.tenantName?.trim() || $LL.common.labels.tenant()
			: toContractName(contract, $LL.common.labels.contract())
	);

	// the units named with the locale's list separator alone, which is not a comma in Arabic. Not
	// `Intl.ListFormat`: in Arabic every join it writes carries "و" glued to the next name, which
	// runs into a Latin name ("وRoom 10"). Each name is isolated where it is drawn, so a Latin name
	// keeps its order in an Arabic line.
	const unitSeparator = $derived($LL.contracts.card.unitSeparator());

	const paymentCount = $derived(contract.paymentCount);
</script>

<RecordCard
	href={resolve(`/contracts/${contract.id}`)}
	{label}
	{actions}
	layout="tile"
	class="gap-3"
>
	{#snippet heading()}
		<Cell.Text class="min-w-0 flex-1 truncate text-sm font-semibold" text={label} />
		<Cell.Status status={contract.status} labelled />
	{/snippet}

	{#snippet content()}
		<div data-contract-fields class="pointer-events-none relative grid grid-cols-2 gap-2">
			<!-- a range rather than "start → end": an arrow does not mirror in Arabic, where the
			     two dates swap and it would then point at the wrong one. -->
			<Cell.Field
				hook="contract-field"
				class="col-span-2"
				icon={CalendarRangeIcon}
				name={$LL.common.labels.contractPeriod()}
				value={formatRecordDateRange($locale, contract.start, contract.end)}
			/>

			<!-- the reference leads the card instead where no tenant is named, and is not repeated. -->
			{#if namesTenant}
				<Cell.Field
					hook="contract-field"
					icon={HashIcon}
					name={$LL.common.labels.contractNumber()}
					empty={!contract.govId.trim()}
				>
					{#if contract.govId.trim()}
						<span class="tabular-nums" dir="ltr">{contract.govId.trim()}</span>
					{:else}
						{$LL.contracts.card.none()}
					{/if}
				</Cell.Field>
			{/if}

			<!-- absent for a reader who may not view units, who is not told what the contract holds. -->
			{#if contract.unitNames}
				<Cell.Field
					hook="contract-field"
					icon={LayoutGridIcon}
					name={$LL.common.labels.units()}
					empty={contract.unitNames.length === 0}
					valueAttributes={{ 'data-contract-units': contract.unitNames.length }}
				>
					{#if contract.unitNames.length === 0}
						{$LL.contracts.card.none()}
					{:else}
						{#each contract.unitNames as name, index (index)}{#if index > 0}{unitSeparator}{/if}<bdi
								>{name}</bdi
							>{/each}
					{/if}
				</Cell.Field>
			{/if}

			<!-- the cost is per cycle, so its name carries the cycle: a bare amount beside a contract
			     reads as what the whole contract is worth. -->
			<Cell.Field
				hook="contract-field"
				icon={RepeatIcon}
				name={$LL.contracts.card.cost({ interval: intervalLabels[contract.interval] })}
			>
				<Cell.Money amount={contract.cost} />
			</Cell.Field>

			<!-- money rather than state. A reader who may not view payments is not told how many
			     there are, and a count of nothing is a word, never a zero. -->
			{#if paymentCount !== undefined}
				<Cell.Field
					hook="contract-field"
					icon={BanknoteIcon}
					name={$LL.common.nav.payments()}
					empty={paymentCount === 0}
					value={paymentCount > 0
						? $LL.contracts.card.paymentCount({ count: paymentCount })
						: $LL.contracts.card.none()}
					valueAttributes={paymentCount > 0 ? { 'data-payment-count': paymentCount } : undefined}
				/>
			{/if}
		</div>

		<!-- the ring, then the figures it is drawn from: on a tile they are read, not hovered. -->
		<div
			data-contract-paid
			class="pointer-events-none relative mt-auto flex min-w-0 items-center gap-3"
		>
			<Cell.Ring value={contract.paidAmount} total={contract.expectedAmount} />
			<Cell.Field
				hook="contract-field"
				class="flex-1"
				icon={WalletIcon}
				name={$LL.contracts.card.paidOfExpected()}
			>
				<span class="tabular-nums">
					{formatLocaleMoneyRange($locale, contract.paidAmount, contract.expectedAmount)}
				</span>
			</Cell.Field>
		</div>
	{/snippet}
</RecordCard>
