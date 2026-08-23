<script lang="ts" module>
	import BanIcon from '@lucide/svelte/icons/ban';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import HomeIcon from '@lucide/svelte/icons/home';
	import PencilIcon from '@lucide/svelte/icons/square-pen';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { Component } from 'svelte';
	import type { HistoryAction } from '$lib/history/history';

	/**
	 * The glyph each change wears.
	 *
	 * The same ones a contract's own action cluster uses — terminating is the same ⃠ here as on
	 * the control that did it, so a reader recognises what happened before reading the line. An
	 * action this table does not know takes the neutral clock rather than nothing, which keeps a
	 * mutation added later from leaving a hole in the column.
	 */
	const actionIcons: Record<HistoryAction, Component<{ class?: string }>> = {
		assigned: HomeIcon,
		created: PlusIcon,
		deleted: Trash2Icon,
		edited: PencilIcon,
		renewed: CalendarPlusIcon,
		terminated: BanIcon,
		unterminated: RotateCcwIcon
	};
</script>

<script lang="ts">
	import List, { recordCard } from '$lib/design/block/list.svelte';
	import { cn } from '@rentable/design/tailwind.js';
	import type { HistoryConcept } from '$lib/history/history';
	import { useListHistory } from '$lib/history/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { getIntlLocale } from '$lib/platform/locale';

	/**
	 * What was done to one record, most recent first.
	 *
	 * It reads and never replays. Nothing on this surface reconstructs anything — undo is still
	 * the session stack it was decided to be, and this answers a different question: not *take
	 * that back* but *what happened here*, including in a session that has since ended.
	 *
	 * Rendered through the list block every other collection uses, so an account behaves like the
	 * records beside it: the same search, the same empty state, and the same virtualization once
	 * a long-lived record has more entries than a screen.
	 */
	let { concept, recordId }: { concept: HistoryConcept; recordId: string } = $props();

	// two lines of text and the breathing room around them, like every other record row here.
	const ROW_HEIGHT = 64;

	let search = $state('');

	const historyQuery = useListHistory(
		() => concept,
		() => recordId,
		() => search
	);
	const entries = $derived(historyQuery.data ?? []);

	// the whole moment, not the day: two changes to one record on one afternoon are told apart
	// by the time or not at all.
	const formatter = $derived(
		new Intl.DateTimeFormat(getIntlLocale($locale), { dateStyle: 'medium', timeStyle: 'short' })
	);

	/**
	 * What happened, rendered now rather than when it was written.
	 *
	 * Its own past-tense vocabulary rather than undo's: an account says *terminated*, where an
	 * undo offer says *terminating the contract* because it is naming the thing it would take
	 * back. An action stored under a key this vocabulary does not carry shows as the key itself
	 * rather than crashing the account — a mutation added later reads oddly, and every entry
	 * beside it still reads.
	 */
	function describe(action: string) {
		const name = $LL.common.history.actions[action as HistoryAction];

		return typeof name === 'function' ? name() : action;
	}
</script>

<List
	data={entries}
	bind:search
	isLoading={historyQuery.isLoading}
	isFetching={historyQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	emptyTitle={$LL.common.history.emptyTitle()}
	emptyDescription={$LL.common.history.emptyDescription()}
>
	{#snippet record(entry: (typeof entries)[number])}
		{@const Icon = actionIcons[entry.action as HistoryAction] ?? ClockIcon}
		<!-- what happened leads, and what it happened to sits under it: the reader is scanning a
		     column of verbs, and the record's own reference is a long identifier that would
		     otherwise be the widest thing on every line. -->
		<div class={cn(recordCard, 'flex h-full items-center gap-3 px-4')}>
			<Icon class="size-4 shrink-0 text-muted-foreground" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-medium capitalize">{describe(entry.action)}</span>
				<span class="truncate text-xs text-muted-foreground">{entry.record}</span>
			</span>
			<!-- the time is the quiet half: what happened is what the reader is scanning for, and
			     when it happened is what they check once they have found it. -->
			<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
				{formatter.format(new Date(entry.at))}
			</span>
		</div>
	{/snippet}
</List>
