import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { formatRecordDate } from '$lib/design/date';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import type { Locales } from '$lib/i18n/i18n-types';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatLocaleMoney } from '$lib/platform/locale';
import QueryProviders from '#tests/query-providers.svelte';
import type { ContractLike } from '$lib/contract/contract';
import { scheduleContract, type SchedulePaymentLike } from '$lib/contract/schedule';
import Schedule from '$lib/contract/component/schedule.svelte';

/**
 * A CONTRACT'S SCHEDULE, ROW BY ROW
 *
 * Ticket 04 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirements 5
 * and 6: every cycle is a row carrying its due date, what it costs, what is paid of it, and its
 * state as an icon with a name; a late row with part of it paid says the part; and a terminated
 * contract's schedule has no late or due row (criterion 6(c)).
 *
 * **The read is the mock, and what it answers is the real allocation.** The pane allocates
 * nothing, so the rows it is handed are `scheduleContract`'s for a fixture contract, serialized
 * the way the procedure serializes them, and what is asserted is what reached the DOM.
 */

const { reads } = vi.hoisted(() => ({
	reads: {
		cycles: [] as { index: number; due: number; amount: number; covered: number; state: string }[],
		asked: [] as string[]
	}
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContractSchedule: (contractId: () => string) => {
		reads.asked.push(contractId());

		return { data: reads.cycles, isLoading: false };
	}
}));

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** four quarterly cycles of 3,000 across 2026, the contract criterion 6 is stated on. */
const QUARTERLY: ContractLike = {
	status: 'active',
	start: day('2026-01-01'),
	end: day('2026-12-31'),
	interval: '3m',
	cost: 3000
};

const PAYMENTS: SchedulePaymentLike[] = [
	{ id: '01990001-0000-7000-8000-000000000000', date: day('2026-01-01'), amount: 3000 },
	{ id: '01990002-0000-7000-8000-000000000000', date: day('2026-03-20'), amount: 1000 }
];

/**
 * what the procedure answers for `contract` on `today`: the real allocation, dates as timestamps.
 */
function answer(contract: ContractLike, payments: SchedulePaymentLike[], today: string) {
	reads.cycles = scheduleContract(contract, payments, day(today)).cycles.map((cycle) => ({
		...cycle,
		due: cycle.due.getTime()
	}));
}

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
});

beforeEach(() => {
	setLocale('en');
	reads.cycles = [];
	reads.asked = [];
});

afterEach(() => {
	document.body.innerHTML = '';
});

const schedule = (direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		Schedule,
		{ contractId: 'contract-1' },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction } }
	);

const rows = () => [...document.querySelectorAll<HTMLElement>('tbody tr[data-cycle]')];
const text = (row: HTMLElement, cell: string) =>
	row.querySelector(`[${cell}]`)?.textContent?.trim();
/** what a row's state is named to a screen reader. */
const stateName = (row: HTMLElement) =>
	row.querySelector('[data-cycle-state] .sr-only')?.textContent?.trim();

test("the pane reads the contract's schedule and draws one row per cycle, in order", () => {
	answer(QUARTERLY, PAYMENTS, '2026-05-10');
	schedule();

	expect(reads.asked).toContain('contract-1');
	expect(rows().map((row) => row.dataset.cycle)).toEqual(['0', '1', '2', '3']);
});

test('each row shows its due date, the amount due, the amount paid, and its state as a named icon', () => {
	answer(QUARTERLY, PAYMENTS, '2026-05-10');
	schedule();

	const money = (value: number) => formatLocaleMoney('en', value);

	expect(
		rows().map((row) => [
			text(row, 'data-cycle-due'),
			text(row, 'data-cycle-amount'),
			text(row, 'data-cycle-covered'),
			row.dataset.state
		])
	).toEqual([
		[formatRecordDate('en', day('2026-01-01')), money(3000), money(3000), 'paid'],
		[formatRecordDate('en', day('2026-04-01')), money(3000), money(1000), 'late'],
		[formatRecordDate('en', day('2026-07-01')), money(3000), money(0), 'upcoming'],
		[formatRecordDate('en', day('2026-10-01')), money(3000), money(0), 'upcoming']
	]);

	// the state is a glyph and a name, and the name is not visible text beside it.
	for (const row of rows()) {
		const state = row.querySelector('[data-cycle-state]');

		expect(state?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		expect(state?.querySelector('.sr-only')?.textContent?.trim()).not.toBe('');
	}

	expect(stateName(rows()[0])).toBe(en.contracts.schedule.states.paid);
	expect(stateName(rows()[2])).toBe(en.contracts.schedule.states.upcoming);
});

test('a late row with part of it paid states the part in its name', () => {
	answer(QUARTERLY, PAYMENTS, '2026-05-10');
	schedule();

	expect(stateName(rows()[1])).toBe(
		`late; ${formatLocaleMoney('en', 1000)} of ${formatLocaleMoney('en', 3000)} paid`
	);
});

test('a late row with nothing paid is named late and no more', () => {
	answer(QUARTERLY, [], '2026-05-10');
	schedule();

	expect(stateName(rows()[0])).toBe(en.contracts.schedule.states.late);
});

test('the cycle due today reads due, and one part paid ahead of its day reads partly paid', () => {
	answer(QUARTERLY, PAYMENTS, '2026-04-01');
	schedule();

	expect(rows().map((row) => row.dataset.state)).toEqual(['paid', 'due', 'upcoming', 'upcoming']);
	expect(stateName(rows()[1])).toBe(en.contracts.schedule.states.due);

	document.body.innerHTML = '';
	answer(QUARTERLY, PAYMENTS, '2026-03-25');
	schedule();

	expect(rows().map((row) => row.dataset.state)).toEqual([
		'paid',
		'partly-paid',
		'upcoming',
		'upcoming'
	]);
	expect(stateName(rows()[1])).toBe(en.contracts.schedule.states.partlyPaid);
});

// criterion 6(c)
test("a terminated contract's schedule shows no late and no due row", () => {
	// the same contract, terminated, read on the day its second cycle falls due and again after
	// every cycle has fallen due: unterminated, both days would show late and due rows.
	for (const today of ['2026-04-01', '2027-02-01']) {
		document.body.innerHTML = '';
		answer({ ...QUARTERLY, status: 'terminated' }, PAYMENTS, today);
		schedule();

		const states = rows().map((row) => row.dataset.state);

		expect(states).toHaveLength(4);
		expect(states).not.toContain('late');
		expect(states).not.toContain('due');
		expect(states).toEqual(['paid', 'partly-paid', 'upcoming', 'upcoming']);
	}
});

test('the schedule reads in Arabic, its states and its part named in Arabic', () => {
	setLocale('ar');
	answer(QUARTERLY, PAYMENTS, '2026-05-10');
	schedule('rtl');

	const header = [...document.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim());
	const locale: Locales = 'ar';

	expect(header).toEqual([
		ar.contracts.schedule.columns.state,
		ar.contracts.schedule.columns.due,
		ar.contracts.schedule.columns.amount,
		ar.contracts.schedule.columns.covered
	]);
	expect(text(rows()[0], 'data-cycle-due')).toBe(formatRecordDate(locale, day('2026-01-01')));
	expect(stateName(rows()[0])).toBe(ar.contracts.schedule.states.paid);
	expect(stateName(rows()[1])).toBe(
		`متأخرة؛ دُفع ${formatLocaleMoney(locale, 1000)} من ${formatLocaleMoney(locale, 3000)}`
	);
});
