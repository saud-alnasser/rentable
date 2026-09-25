<script lang="ts" module>
	import type { ContractScheduleCycle } from '$lib/contract/query';

	/** Everything a printed schedule carries, read by the host before it prints. */
	export type PrintedScheduleValue = {
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
	 * A contract's schedule on paper: who and what it is for, then every cycle with its due date,
	 * what it costs, what is paid of it, and its state.
	 *
	 * **Every heading is in Arabic and in English**, whichever language the reader has chosen,
	 * because the page is handed to a tenant who may read either. Each carries its own language and
	 * direction, so the Arabic is shaped and runs right to left inside an English page and the
	 * English the other way inside an Arabic one. The values are written in the reader's language,
	 * with Western digits in both (`platform/locale.ts`).
	 *
	 * Drawn for the print sheet and nowhere else, so its state is a word rather than the pane's
	 * glyph and tooltip: paper has no pointer to hover with. It allocates nothing; the cycles are
	 * the ones `contract.schedule` answered with.
	 */
	let { value, locale }: { value: PrintedScheduleValue; locale: Locales } = $props();

	// both are in memory from startup on (`layout/startup.ts`), whichever one the reader chose.
	const arabic = i18nObject('ar');
	const english = i18nObject('en');
</script>

{#snippet both(say: (t: TranslationFunctions) => string)}
	<span lang="ar" dir="rtl" class="block first-letter:uppercase">{say(arabic)}</span>
	<span lang="en" dir="ltr" class="block first-letter:uppercase">{say(english)}</span>
{/snippet}

<article class="flex flex-col gap-6" data-printed-schedule>
	<h1 class="flex flex-col gap-1 text-lg font-semibold">
		{@render both((t) => t.contracts.schedule.printTitle())}
	</h1>

	<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
		{#if value.contract.govId.trim()}
			<dt class="text-xs text-muted-foreground">
				{@render both((t) => t.common.labels.contractNumber())}
			</dt>
			<dd class="font-medium"><span dir="ltr">{value.contract.govId}</span></dd>
		{/if}

		<dt class="text-xs text-muted-foreground">
			{@render both((t) => t.common.labels.contractPeriod())}
		</dt>
		<dd class="font-medium tabular-nums">
			{formatRecordDateRange(locale, value.contract.start, value.contract.end)}
		</dd>

		<dt class="text-xs text-muted-foreground">
			{@render both((t) => t.common.labels.tenant())}
		</dt>
		<dd class="font-medium" data-printed-tenant><bdi>{value.tenant.name}</bdi></dd>

		<dt class="text-xs text-muted-foreground">
			{@render both((t) => t.common.labels.units())}
		</dt>
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
				<th class="py-2 text-start align-bottom font-medium">
					{@render both((t) => t.contracts.schedule.columns.due())}
				</th>
				<th class="py-2 ps-4 text-end align-bottom font-medium">
					{@render both((t) => t.contracts.schedule.columns.amount())}
				</th>
				<th class="py-2 ps-4 text-end align-bottom font-medium">
					{@render both((t) => t.contracts.schedule.columns.covered())}
				</th>
				<th class="py-2 ps-4 text-start align-bottom font-medium">
					{@render both((t) => t.contracts.schedule.columns.state())}
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
					<td class="py-2 ps-4 text-start" data-cycle-state>
						{@render both((t) => t.contracts.schedule.states[stateKeys[cycle.state]]())}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</article>
