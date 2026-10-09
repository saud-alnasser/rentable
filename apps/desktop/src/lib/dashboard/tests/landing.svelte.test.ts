import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient, type QueryKey } from '@tanstack/svelte-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type api from '$lib/api/caller';
import '$lib/app/surfaces';
import { keys as contractKeys } from '$lib/contract/query';
import type { ContractRankSummary } from '$lib/contract/rank/rank';
import Landing from '$lib/dashboard/component/landing.svelte';
import { keys as dashboardKeys } from '$lib/dashboard/query';
import { formatRecordDate } from '$lib/date';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { contributionsTo } from '$lib/feature/surface';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatLocaleMoney } from '$lib/platform/locale';
import en from '$lib/i18n/en';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';
import Providers from '#tests/providers.svelte';

/**
 * THE LANDING SCREEN, AND THE ENDING-SOON WINDOW SET FROM IT
 *
 * Requirement 11 of effort 835: a contract with a cycle coming due within the week is under its
 * own rank, *due soon*, whose rows state the amount coming due and the day it falls due. It is not
 * owed yet, so the outstanding figure in the band is the money ranks' alone.
 *
 * Requirements 6 and 7 of effort 846: the ending-soon section's header carries the control for the
 * window that defines it, and stands with no rows where nothing falls in the window. A change is
 * written through the settings' mutation and seen in place: the screen's read is refetched and the
 * section and the band redrawn from it.
 *
 * **What reaches Rust is stood in for**: the dashboard's read and the settings' write at the
 * caller, so the screen's own query and the mutation run as they do in the window. The read
 * answers in the shape the dashboard router answers with (`dashboard/tests/router.test.ts` holds
 * the read itself). The address is stood in for too, since this runner has no navigation.
 */

type Dashboard = Awaited<ReturnType<typeof api.dashboard.get>>;
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

const ENDING_RANK: ContractRankSummary = { rank: 'ending-soon', contractCount: 1, totalAmount: 0 };
const ENDING = entry({ id: 'ending', rank: 'ending-soon' });

const host = vi.hoisted(() => ({
	dashboardGet: vi.fn(),
	settingsSet: vi.fn(),
	address: new URL('http://localhost/'),
	went: [] as { address: string; replaceState?: boolean }[]
}));

vi.mock('$lib/api/caller', () => ({
	default: {
		dashboard: { get: (input: unknown) => host.dashboardGet(input) },
		settings: { set: (input: unknown) => host.settingsSet(input) }
	}
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return host.address;
		}
	}
}));

vi.mock('$app/navigation', async (original) => ({
	...(await original<typeof import('$app/navigation')>()),
	goto: async (address: string, options?: { replaceState?: boolean }) => {
		host.went.push({ address, replaceState: options?.replaceState });
	}
}));

const answer = (
	ranks: ContractRankSummary[],
	queue: QueueEntry[],
	endingSoonNoticeDays = 60
): Dashboard => ({
	endingSoonNoticeDays,
	ranks,
	queue,
	summary: { money: { due: 0, collected: 0 }, occupancy: { totalUnits: 0, occupiedUnits: 0 } }
});

/** the dashboard's read answers this, every time it is asked, until told otherwise. */
const reads = (dashboard: Dashboard) => host.dashboardGet.mockResolvedValue(dashboard);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	layOutLists();
	host.dashboardGet.mockReset();
	host.settingsSet.mockReset();
	host.address = new URL('http://localhost/');
	host.went.length = 0;
});

const renderLanding = () =>
	render(Landing, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

/** the band's outstanding figure, found under its own label. */
const outstandingFigure = () =>
	screen.getByText('outstanding', { exact: false }).closest('a')?.textContent ?? '';

/** the ending-soon section, held or vacant. */
const endingSoonSection = () =>
	document.querySelector<HTMLElement>('[data-dashboard-section="ending-soon"]');

const noneLine = (days: number) =>
	en.dashboard.endingSoon.none
		.replace('{days|number}', String(days))
		.replace('{{day|days}}', 'days');

/** the header's control, opened: the popover's number field. */
async function openControl() {
	await fireEvent.click(
		within(endingSoonSection()!).getByRole('button', { name: en.dashboard.endingSoon.change })
	);

	return waitFor(() => {
		const field = document.querySelector<HTMLInputElement>('[data-ending-soon] input');

		expect(field).not.toBeNull();

		return field!;
	});
}

test('a due-soon section states the cycle coming due, its amount and its due date', async () => {
	reads(
		answer(
			[...MONEY_RANKS, { rank: 'due-soon', contractCount: 1, totalAmount: 0 }],
			[...MONEY_QUEUE, COMING_DUE]
		)
	);

	renderLanding();

	const heading = await screen.findByRole('heading', { name: 'due soon' });
	const section = heading.closest('section');

	expect(section).toBeTruthy();

	const row = within(section!).getByText('Tenant coming').closest('div.relative');

	expect(row?.textContent).toContain(formatLocaleMoney('en', 1200));
	expect(row?.textContent).toContain(formatRecordDate('en', DUE));
});

test('the due-soon section reads after owing and before ending soon', async () => {
	reads(
		answer(
			[...MONEY_RANKS, { rank: 'due-soon', contractCount: 1, totalAmount: 0 }, ENDING_RANK],
			[...MONEY_QUEUE, COMING_DUE, ENDING]
		)
	);

	renderLanding();

	await screen.findByRole('heading', { name: 'ending soon' });

	expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
		'overdue',
		'owing',
		'due soon',
		'ending soon'
	]);
});

test('what falls due this week does not change the outstanding figure', async () => {
	reads(answer(MONEY_RANKS, MONEY_QUEUE));
	const { unmount } = renderLanding();
	await screen.findByRole('heading', { name: 'owing' });
	const without = outstandingFigure();
	unmount();

	// the due-soon summary carries a total here though the read answers zero for it, so a figure
	// summing every rank rather than the money ranks would show it.
	reads(
		answer(
			[...MONEY_RANKS, { rank: 'due-soon', contractCount: 1, totalAmount: 1200 }],
			[...MONEY_QUEUE, COMING_DUE]
		)
	);
	renderLanding();
	await screen.findByRole('heading', { name: 'due soon' });

	expect(without).toContain(formatLocaleMoney('en', 4750));
	expect(outstandingFigure()).toBe(without);
});

// effort 838, requirement 10: the router answers a reader who may not view tenants with a queue
// that names nobody, and a row then leads with the contract's own reference and draws no phone.
test('a queue row answered without its tenant leads with the contract and names nobody', async () => {
	const late: QueueEntry = {
		id: 'late',
		govId: 'GOV-7',
		rank: 'overdue',
		status: 'defaulted',
		outstandingAmount: 4000,
		contractEnd: Date.UTC(2026, 6, 17),
		isEndingSoon: false
	};

	reads(answer(MONEY_RANKS.slice(0, 1), [late]));

	renderLanding();

	const section = (await screen.findByRole('heading', { name: 'overdue' })).closest('section')!;
	const row = within(section).getByText('GOV-7').closest('div.relative');

	expect(row?.textContent).not.toContain('Tenant');
	expect(row?.textContent).not.toContain('+966');
	expect(row?.querySelector('a')?.getAttribute('aria-label')).toBe(
		en.dashboard.sections.openContractNumbered.replace('{number}', 'GOV-7')
	);
});

// effort 846, criterion 6: the header's control writes the days through the settings' mutation,
// and the screen's read, refetched, redraws the section and the band in place.
test('the header control changes the days, and the refetched read redraws the section and the band', async () => {
	reads(answer(MONEY_RANKS, MONEY_QUEUE, 60));
	host.settingsSet.mockImplementation(async ({ endingSoonNoticeDays }) => {
		// the window now catches a contract, and the read says so: the rank, its row, and a band
		// that has moved on with it.
		reads(
			answer(
				[MONEY_RANKS[0], { rank: 'owing', contractCount: 1, totalAmount: 900 }, ENDING_RANK],
				[MONEY_QUEUE[0], entry({ id: 'behind', rank: 'owing', outstandingAmount: 900 }), ENDING],
				endingSoonNoticeDays
			)
		);

		return { endingSoonNoticeDays };
	});

	renderLanding();

	await waitFor(() => expect(endingSoonSection()?.textContent).toContain(noneLine(60)));
	expect(outstandingFigure()).toContain(formatLocaleMoney('en', 4750));

	const field = await openControl();

	expect(field.value).toBe('60');

	await fireEvent.click(screen.getByRole('button', { name: en.dashboard.endingSoon.more }));

	expect(field.value).toBe('61');

	await waitFor(() =>
		expect(within(endingSoonSection()!).queryByText('Tenant ending')).not.toBeNull()
	);

	expect(host.settingsSet).toHaveBeenCalledExactlyOnceWith({ endingSoonNoticeDays: 61 });
	expect(endingSoonSection()?.hasAttribute('data-vacant')).toBe(false);
	expect(outstandingFigure()).toContain(formatLocaleMoney('en', 4900));
	expect(field.value).toBe('61');
});

// effort 846, criterion 7: with nothing in the window the header still stands, saying so, with the
// control; and an answer that holds the rank fills it in place. Under the empty state too, where
// nothing ranks at all.
test('with no ending-soon rank the header stands with its control, and a read holding the rank fills it', async () => {
	reads(answer([], [], 30));
	host.settingsSet.mockImplementation(async ({ endingSoonNoticeDays }) => {
		reads(answer([ENDING_RANK], [ENDING], endingSoonNoticeDays));

		return { endingSoonNoticeDays };
	});

	renderLanding();

	await waitFor(() => expect(endingSoonSection()).not.toBeNull());

	expect(screen.getByText(en.dashboard.empty.title)).toBeDefined();
	expect(endingSoonSection()?.hasAttribute('data-vacant')).toBe(true);
	expect(within(endingSoonSection()!).getByRole('heading', { level: 2 }).textContent).toBe(
		'ending soon'
	);
	expect(endingSoonSection()?.textContent).toContain(noneLine(30));
	expect(endingSoonSection()?.querySelectorAll('a[href^="/contracts/"]')).toHaveLength(0);

	const field = await openControl();

	await fireEvent.input(field, { target: { value: '90' } });

	await waitFor(() =>
		expect(within(endingSoonSection()!).queryByText('Tenant ending')).not.toBeNull()
	);

	expect(host.settingsSet).toHaveBeenCalledExactlyOnceWith({ endingSoonNoticeDays: 90 });
	expect(endingSoonSection()?.hasAttribute('data-vacant')).toBe(false);
	expect(screen.queryByText(en.dashboard.empty.title)).toBeNull();
	expect(document.querySelectorAll('[data-dashboard-section="ending-soon"]')).toHaveLength(1);
});

// effort 846, requirement 4 as the control carries it: an invalid value marks its own field and is
// not written.
test('an invalid value marks its own field and is not written', async () => {
	reads(answer(MONEY_RANKS, MONEY_QUEUE, 60));

	renderLanding();
	await waitFor(() => expect(endingSoonSection()).not.toBeNull());

	const field = await openControl();

	for (const value of ['0', '', '2.5']) {
		await fireEvent.input(field, { target: { value } });

		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toBe(
			en.dashboard.endingSoon.invalid
		);
	}

	// past the wait after which a valid value would have gone.
	await new Promise((settle) => setTimeout(settle, 600));

	expect(host.settingsSet).not.toHaveBeenCalled();
});

// and a write the shell refuses puts the figure as it stands back in the field.
test('a rejected write puts the old value back', async () => {
	reads(answer(MONEY_RANKS, MONEY_QUEUE, 60));
	host.settingsSet.mockRejectedValue(new Error('the settings could not be written'));

	renderLanding();
	await waitFor(() => expect(endingSoonSection()).not.toBeNull());

	const field = await openControl();

	await fireEvent.input(field, { target: { value: '45' } });

	expect(field.value).toBe('45');

	await waitFor(() => expect(host.settingsSet).toHaveBeenCalledOnce());
	await waitFor(() => expect(field.value).toBe('60'));
	expect(field.getAttribute('aria-invalid')).toBeNull();
});

// effort 846, criterion 6: every reading of the rank refreshes, not the dashboard alone. What the
// mutation invalidates with the settings is this list; each key here is one a reader of the rank
// is cached under.
test('changing the days invalidates the contracts list and record keys as well as the dashboard', async () => {
	const client = new QueryClient();
	const id = 'contract-1';
	const readers: QueryKey[] = [
		dashboardKeys.get('this-month'),
		contractKeys.list('', null, { rank: 'ending-soon' }),
		contractKeys.list('', null),
		contractKeys.get(id),
		contractKeys.getSchedule(id)
	];

	for (const key of readers) {
		client.setQueryData(key, {});
	}

	for (const queryKey of contributionsTo('settings').endingSoonReaders()) {
		await client.invalidateQueries({ queryKey });
	}

	for (const key of readers) {
		expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
	}
});

// effort 846, criterion 6: the command menu's place for the window lands here with the parameter,
// which opens the control and is cleared from the address.
test('the ending-soon parameter opens the control and is cleared from the address', async () => {
	host.address = new URL('http://localhost/?ending-soon');
	reads(answer([ENDING_RANK], [ENDING], 60));

	renderLanding();

	await waitFor(() =>
		expect(document.querySelector<HTMLInputElement>('[data-ending-soon] input')?.value).toBe('60')
	);
	expect(host.went).toEqual([{ address: '/', replaceState: true }]);
});

/**
 * MONEY RETURNED BESIDE MONEY COLLECTED
 *
 * Effort 854, requirement 28: the money card states the refunds dated in the period beside what
 * was collected, named, and only when there were any. Collected is shown as the read answers it,
 * with nothing taken off for what went back.
 */
const answerWithMoney = (money: Dashboard['summary']['money']): Dashboard => ({
	...answer(MONEY_RANKS, MONEY_QUEUE),
	summary: { money, occupancy: { totalUnits: 0, occupiedUnits: 0 } }
});

/** the money card: the card the collected label heads. */
const moneyCard = () =>
	screen.getByText('collected').closest<HTMLElement>('.rounded-2xl')?.textContent ?? '';

test('a period with a refund shows what was returned beside what was collected', async () => {
	reads(answerWithMoney({ due: 1000, collected: 800, returned: 200 }));
	renderLanding();
	await screen.findByRole('heading', { name: 'owing' });

	const card = moneyCard();

	expect(card).toContain(formatLocaleMoney('en', 800));
	expect(card).toContain('returned');
	expect(card).toContain(formatLocaleMoney('en', 200));
});

test('a period with no refund shows no returned figure', async () => {
	reads(answerWithMoney({ due: 1000, collected: 800 }));
	renderLanding();
	await screen.findByRole('heading', { name: 'owing' });

	expect(moneyCard()).toContain(formatLocaleMoney('en', 800));
	expect(moneyCard()).not.toContain('returned');
});

/**
 * A FIGURE THE SCREEN DOES NOT KNOW IS NOT DRAWN
 *
 * Ticket 05 of effort 861, requirement 2 and criterion 2: while the dashboard's read is on its way
 * the band and the sections draw the loading block, and no figure reads `0`; when the read fails
 * the failed state stands in place of both, with *try again*, and *nothing to chase* is not drawn,
 * since nobody knows whether there is anything to chase.
 */

/** the region the one empty block draws, of whichever kind. */
const emptyRegion = () => document.querySelector<HTMLElement>('[data-empty]');

test('while the read is on its way the band draws its skeleton and no zero', async () => {
	host.dashboardGet.mockReturnValue(new Promise(() => {}));

	renderLanding();

	// past the loading block's delay, so the skeleton is up rather than the busy region before it.
	await waitFor(() => expect(document.querySelector('[data-loading="skeleton"]')).not.toBeNull());

	expect(document.querySelector('[data-dashboard-band-skeleton]')).not.toBeNull();
	expect(document.body.textContent).not.toMatch(/0/);
	expect(screen.queryByText('collected')).toBeNull();
	expect(screen.queryByText(en.dashboard.empty.title)).toBeNull();
	expect(emptyRegion()).toBeNull();
});

test('a read that failed draws the failed state in place of the band and the sections', async () => {
	host.dashboardGet.mockRejectedValue(new Error('the workspace could not be read'));

	renderLanding();

	await waitFor(() => expect(emptyRegion()?.dataset.empty).toBe('failed'));

	expect(emptyRegion()?.textContent).toContain(strings.readFailed);
	expect(screen.queryByText(en.dashboard.empty.title)).toBeNull();
	expect(screen.queryByText('collected')).toBeNull();
	expect(screen.queryByText('outstanding', { exact: false })).toBeNull();
	expect(endingSoonSection()).toBeNull();
	expect(document.body.textContent).not.toMatch(/0/);
});

test('try again runs the read again, and a read that answers draws the band and the sections', async () => {
	host.dashboardGet.mockRejectedValueOnce(new Error('the workspace could not be read'));
	reads(answer(MONEY_RANKS, MONEY_QUEUE));

	renderLanding();

	await waitFor(() => expect(emptyRegion()?.dataset.empty).toBe('failed'));

	expect(host.dashboardGet).toHaveBeenCalledTimes(1);

	await fireEvent.click(within(emptyRegion()!).getByRole('button', { name: strings.tryAgain }));

	await screen.findByRole('heading', { name: 'owing' });

	expect(host.dashboardGet).toHaveBeenCalledTimes(2);
	expect(document.querySelector('[data-empty="failed"]')).toBeNull();
	expect(outstandingFigure()).toContain(formatLocaleMoney('en', 4750));
});

// and nothing to chase is a read that answered with no ranks, not one still on its way.
test('nothing to chase is drawn once a read answers with no ranks', async () => {
	reads(answer([], []));

	renderLanding();

	await screen.findByText(en.dashboard.empty.title);

	expect(emptyRegion()?.dataset.empty).toBe('nothing-yet');
	expect(screen.getByText('collected')).toBeDefined();
});

/**
 * A FIGURE THE READER MAY NOT VIEW IS LEFT OUT
 *
 * Ticket 05 of effort 861, requirement 2, as effort 838's requirement 10 answers it: the read
 * leaves out each figure whose kind the reader may not view, and the band leaves it out with it,
 * rather than drawing it as `0`. A card with nothing the reader may see is not drawn, and the money
 * ring only where both what was due and what was collected are known. Without contracts, the
 * outstanding figure, the sections and *nothing to chase* are not drawn either: each would be read
 * off a list the reader was not allowed to read.
 */

afterEach(forgetReader);

/** the money card's ring, where it is drawn. */
const moneyRing = () =>
	screen.queryByText('collected')?.closest('.rounded-2xl')?.querySelector('[data-ring-figure]') ??
	null;

test('without payments, collected is left out and what was due stands alone with no ring', async () => {
	holdEveryFlagBut('viewPayment');
	reads({
		...answer(MONEY_RANKS, MONEY_QUEUE),
		summary: { money: { due: 1500 }, occupancy: { totalUnits: 4, occupiedUnits: 3 } }
	});

	renderLanding();
	await screen.findByRole('heading', { name: 'owing' });

	const card = screen.getByText(en.dashboard.figures.expected).closest<HTMLElement>('.rounded-2xl');

	expect(screen.queryByText('collected')).toBeNull();
	expect(card?.textContent).toContain(formatLocaleMoney('en', 1500));
	expect(card?.querySelector('[data-ring-figure]')).toBeNull();
	expect(outstandingFigure()).toContain(formatLocaleMoney('en', 4750));
});

test('without contracts, neither outstanding, the sections nor nothing to chase is drawn', async () => {
	holdEveryFlagBut('viewContract');
	reads({
		...answer([], []),
		summary: { money: { collected: 800 }, occupancy: { totalUnits: 4, occupiedUnits: 3 } }
	});

	renderLanding();
	await screen.findByText('collected');

	expect(screen.getByText('collected').closest('.rounded-2xl')?.textContent).toContain(
		formatLocaleMoney('en', 800)
	);
	expect(moneyRing()).toBeNull();
	expect(screen.queryByText('outstanding', { exact: false })).toBeNull();
	expect(screen.queryByText(en.dashboard.empty.title)).toBeNull();
	expect(endingSoonSection()).toBeNull();
	expect(document.querySelector('[data-dashboard-section]')).toBeNull();
});

test('without units, the occupancy card is not drawn', async () => {
	holdEveryFlagBut('viewUnit');
	reads({
		...answer(MONEY_RANKS, MONEY_QUEUE),
		summary: { money: { due: 1500, collected: 800 } }
	});

	renderLanding();
	await screen.findByRole('heading', { name: 'owing' });

	expect(screen.queryByText(en.dashboard.figures.occupiedUnits)).toBeNull();
	expect(document.querySelector('[data-occupancy-figure]')).toBeNull();
	expect(moneyRing()).not.toBeNull();
	expect(outstandingFigure()).toContain(formatLocaleMoney('en', 4750));
});
