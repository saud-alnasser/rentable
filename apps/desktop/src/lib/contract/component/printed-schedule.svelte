<script lang="ts" module>
	import type { ContractScheduleCycle } from '$lib/contract/query';

	/** Everything a printed schedule carries, read by the host before it is previewed. */
	export type PrintedScheduleValue = {
		/** the organization the contract is kept by, by its name. */
		issuer: string;
		contract: { govId: string; start: number; end: number };
		tenant: { name: string };
		units: { name: string; complexName: string }[];
		cycles: ContractScheduleCycle[];
	};
</script>

<script lang="ts">
	import { formatRecordDate, formatRecordDateRange } from '$lib/design/date';
	import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import { formatLocaleMoney } from '$lib/platform/locale';
	import { stateKeys } from './cycle-state.svelte';

	/**
	 * A contract's schedule on paper, as a document in one language: who keeps it and what it is at
	 * the head, then the contract, its tenant and its units, then every cycle with its due date,
	 * what it costs, what is paid of it, and its state.
	 *
	 * **One language, the one the reader chose** in the preview (effort 835, requirement 10,
	 * revised). The page carries its own `lang` and `dir`, so an Arabic schedule runs right to left
	 * whatever the application is showing, with Western digits (`platform/locale.ts`).
	 *
	 * Drawn for paper and nowhere else, so its state is a word rather than the pane's glyph and
	 * tooltip: paper has no pointer to hover with. It allocates nothing; the cycles are the ones
	 * `contract.schedule` answered with.
	 */
	let { value, locale }: { value: PrintedScheduleValue; locale: Locales } = $props();

	// every locale is in memory from startup on (`layout/startup.ts`), whichever one is showing.
	const t = $derived<TranslationFunctions>(i18nObject(locale));
	const dir = $derived(locale === 'ar' ? 'rtl' : 'ltr');
	const govId = $derived(value.contract.govId.trim());
</script>

<article lang={locale} {dir} class="flex flex-col gap-8 text-sm" data-printed-schedule>
	<header class="flex items-start justify-between gap-6 border-b border-border pb-6">
		<p class="text-lg font-semibold" data-printed-issuer><bdi>{value.issuer}</bdi></p>

		<div class="flex flex-col items-end gap-1 text-end">
			<h1 class="text-xl font-semibold first-letter:uppercase">
				{t.contracts.schedule.printTitle()}
			</h1>
			{#if govId}
				<p class="text-muted-foreground">
					<span class="first-letter:uppercase">{t.common.labels.contractNumber()}</span>
					<span class="text-foreground" dir="ltr">{govId}</span>
				</p>
			{/if}
		</div>
	</header>

	<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-3">
		<dt class="text-muted-foreground first-letter:uppercase">{t.common.labels.tenant()}</dt>
		<dd class="font-medium" data-printed-tenant><bdi>{value.tenant.name}</bdi></dd>

		<dt class="text-muted-foreground first-letter:uppercase">
			{t.common.labels.contractPeriod()}
		</dt>
		<dd class="font-medium tabular-nums">
			{formatRecordDateRange(locale, value.contract.start, value.contract.end)}
		</dd>

		<dt class="text-muted-foreground first-letter:uppercase">{t.common.labels.units()}</dt>
		<dd class="font-medium" data-printed-units>
			{#each value.units as unit, index (index)}
				<span class="block"><bdi>{unit.name}</bdi> · <bdi>{unit.complexName}</bdi></span>
			{:else}
				<span>—</span>
			{/each}
		</dd>
	</dl>

	<table class="w-full border-collapse">
		<thead>
			<tr class="border-b border-border text-xs text-muted-foreground">
				<th class="py-2 text-start font-medium first-letter:uppercase">
					{t.contracts.schedule.columns.due()}
				</th>
				<th class="py-2 ps-4 text-end font-medium first-letter:uppercase">
					{t.contracts.schedule.columns.amount()}
				</th>
				<th class="py-2 ps-4 text-end font-medium first-letter:uppercase">
					{t.contracts.schedule.columns.covered()}
				</th>
				<th class="py-2 ps-4 text-start font-medium first-letter:uppercase">
					{t.contracts.schedule.columns.state()}
				</th>
			</tr>
		</thead>
		<tbody>
			{#each value.cycles as cycle (cycle.index)}
				<!-- a row is never cut across two pages. -->
				<tr
					class="break-inside-avoid border-b border-border/60"
					data-cycle={cycle.index}
					data-state={cycle.state}
				>
					<td class="py-2 text-start tabular-nums" data-cycle-due>
						{formatRecordDate(locale, cycle.due)}
					</td>
					<td class="py-2 ps-4 text-end tabular-nums" data-cycle-amount>
						{formatLocaleMoney(locale, cycle.amount)}
					</td>
					<td class="py-2 ps-4 text-end tabular-nums" data-cycle-covered>
						{formatLocaleMoney(locale, cycle.covered)}
					</td>
					<td class="py-2 ps-4 text-start first-letter:uppercase" data-cycle-state>
						{t.contracts.schedule.states[stateKeys[cycle.state]]()}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</article>
