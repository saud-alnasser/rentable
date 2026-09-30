<script lang="ts">
	import { formatCalendarDate, joinDateRange } from '$lib/date';
	import { formatLocaleMoney, getIntlLocale } from '$lib/platform/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';

	/**
	 * What the contract will be, as the form's fields stand: its tenant, what the whole term is
	 * worth, and the period it runs for.
	 */
	let {
		tenantName,
		cost,
		cycles,
		start,
		end
	}: {
		tenantName: string | undefined;
		/** the cost per cycle and the number of cycles, as the fields hold them. */
		cost: string;
		cycles: string;
		start: CalendarDate | undefined;
		end: CalendarDate | undefined;
	} = $props();

	const dateFormatter = $derived(
		new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' })
	);

	const totalExpectedAmount = $derived(Number(cost) * Number(cycles));
	const hasTotalExpectedAmount = $derived(
		Number.isFinite(totalExpectedAmount) && totalExpectedAmount > 0
	);
	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// a range needs both ends, and a half-set period reads as one date rather than as a range
	// missing a half — the em dash already means "nothing here" everywhere else in this panel.
	const contractPeriod = $derived(
		start && end
			? joinDateRange(
					formatCalendarDate(start, dateFormatter, ''),
					formatCalendarDate(end, dateFormatter, '')
				)
			: '—'
	);
</script>

<!-- what the contract will be, pinned above the fields that decide it — it is sticky
     because the total is answered by cost and cycles, which are far enough down that a
     read-out scrolling with them leaves exactly when it is being used. The opaque wrapper
     is what the tinted panel is stacked on: sticky over a translucent fill shows the
     fields sliding underneath it. The period is a range rather than "start → end"
     because an arrow does not mirror in Arabic, where the two dates swap and it would
     then point at the wrong one. -->
<div class="sticky top-0 z-10 bg-card pb-1">
	<div class="grid grid-cols-2 gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
		<div class="col-span-2 flex flex-col">
			<span class="text-xs text-muted-foreground">{$LL.common.labels.tenant()}</span>
			<span class="truncate font-medium">{tenantName ?? '—'}</span>
		</div>
		<div class="flex min-w-0 flex-col">
			<span class="truncate text-xs text-muted-foreground">
				{$LL.contracts.form.totalExpectedAmount()}
			</span>
			<span class="truncate font-medium tabular-nums">
				{hasTotalExpectedAmount ? formatMoney(totalExpectedAmount) : '—'}
			</span>
		</div>
		<div class="flex min-w-0 flex-col">
			<span class="truncate text-xs text-muted-foreground">
				{$LL.common.labels.contractPeriod()}
			</span>
			<span class="truncate text-sm tabular-nums">{contractPeriod}</span>
		</div>
	</div>
</div>
