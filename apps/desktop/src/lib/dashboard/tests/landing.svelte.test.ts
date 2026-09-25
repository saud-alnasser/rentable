import { render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import type api from '$lib/api/caller';
import type { ContractRankSummary } from '$lib/contract/rank';
import Landing from '$lib/dashboard/component/landing.svelte';
import { formatRecordDate } from '$lib/design/date';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatLocaleMoney } from '$lib/platform/locale';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * WHAT FALLS DUE THIS WEEK IS ON THE LANDING SCREEN
 *
 * Requirement 11 of effort 835: a contract with a cycle coming due within the week is under its
 * own rank, *due soon*, whose rows state the amount coming due and the day it falls due. It is not
 * owed yet, so the outstanding figure in the band is the money ranks' alone.
 *
 * The screen is rendered over its read mocked, in the shape the dashboard router answers with
 * (`dashboard/tests/router.test.ts` holds the read itself).
 */

type Dashboard = Awaited<ReturnType<typeof api.contract.dashboard>>;
type QueueEntry = Dashboard['queue'][number];

const DUE = Date.UTC(2026, 0, 18);

const entry = (overrides: Partial<QueueEntry> & Pick<QueueEntry, 'id' | 'rank'>): QueueEntry => ({
	govId: overrides.id,
	status: 'active',
	tenantName: `Tenant ${overrides.id}`,
	tenantPhone: '+966550000000',
	outstandingAmount: 0,
	contractEnd: Date.UTC(2026, 6, 17),
	isEndingSoon: false,
	...overrides
});

const MONEY_RANKS: ContractRankSummary[] = [
	{ rank: 'overdue', contractCount: 1, totalAmount: 4000 },
	{ rank: 'owing', contractCount: 1, totalAmount: 750 }
];

const MONEY_QUEUE: QueueEntry[] = [
	entry({ id: 'late', rank: 'overdue', status: 'defaulted', outstandingAmount: 4000 }),
	entry({ id: 'behind', rank: 'owing', outstandingAmount: 750 })
];

const COMING_DUE = entry({ id: 'coming', rank: 'due-soon', comingDue: { due: DUE, amount: 1200 } });

const { dashboard } = vi.hoisted(() => ({ dashboard: { data: undefined as unknown } }));

vi.mock('$lib/dashboard/query', () => ({
	useFetchContractWorkQueue: () => ({
		get data() {
			return dashboard.data;
		},
		isLoading: false
	})
}));

const answer = (ranks: ContractRankSummary[], queue: QueueEntry[]): Dashboard => ({
	endingSoonNoticeDays: 60,
	ranks,
	queue,
	summary: { money: { due: 0, collected: 0 }, occupancy: { totalUnits: 0, occupiedUnits: 0 } }
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

const renderLanding = () =>
	render(Landing, {}, { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } });

/** the band's outstanding figure, found under its own label. */
const outstandingFigure = () =>
	screen.getByText('outstanding', { exact: false }).closest('a')?.textContent ?? '';

test('a due-soon section states the cycle coming due, its amount and its due date', () => {
	dashboard.data = answer(
		[...MONEY_RANKS, { rank: 'due-soon', contractCount: 1, totalAmount: 0 }],
		[...MONEY_QUEUE, COMING_DUE]
	);

	renderLanding();

	const heading = screen.getByRole('heading', { name: 'due soon' });
	const section = heading.closest('section');

	expect(section).toBeTruthy();

	const row = within(section!).getByText('Tenant coming').closest('div.relative');

	expect(row?.textContent).toContain(formatLocaleMoney('en', 1200));
	expect(row?.textContent).toContain(formatRecordDate('en', DUE));
});

test('the due-soon section reads after owing and before ending soon', () => {
	dashboard.data = answer(
		[
			...MONEY_RANKS,
			{ rank: 'due-soon', contractCount: 1, totalAmount: 0 },
			{ rank: 'ending-soon', contractCount: 1, totalAmount: 0 }
		],
		[...MONEY_QUEUE, COMING_DUE, entry({ id: 'ending', rank: 'ending-soon' })]
	);

	renderLanding();

	expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
		'overdue',
		'owing',
		'due soon',
		'ending soon'
	]);
});

test('what falls due this week does not change the outstanding figure', () => {
	dashboard.data = answer(MONEY_RANKS, MONEY_QUEUE);
	const { unmount } = renderLanding();
	const without = outstandingFigure();
	unmount();

	// the due-soon summary carries a total here though the read answers zero for it, so a figure
	// summing every rank rather than the money ranks would show it.
	dashboard.data = answer(
		[...MONEY_RANKS, { rank: 'due-soon', contractCount: 1, totalAmount: 1200 }],
		[...MONEY_QUEUE, COMING_DUE]
	);
	renderLanding();

	expect(without).toContain(formatLocaleMoney('en', 4750));
	expect(outstandingFigure()).toBe(without);
});
