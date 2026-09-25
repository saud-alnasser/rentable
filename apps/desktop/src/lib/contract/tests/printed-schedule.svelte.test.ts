import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import type { Locales } from '$lib/i18n/i18n-types';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatRecordDate } from '$lib/design/date';
import { formatLocaleMoney } from '$lib/platform/locale';
import type { ContractLike } from '$lib/contract/contract';
import { scheduleContract, type SchedulePaymentLike } from '$lib/contract/schedule';
import PrintedSchedule, {
	type PrintedScheduleValue
} from '$lib/contract/component/printed-schedule.svelte';

/**
 * A CONTRACT'S SCHEDULE, ON PAPER
 *
 * Tickets 05 and 11 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]],
 * requirement 7 and criterion 7, as revised on 2026-09-25: the page carries the contract, its
 * tenant, its units and every row of criterion 5's contract, entirely in the language the reader
 * chose, in Western digits either way. The printed page itself is checked by hand (criterion 10).
 *
 * The rows are the real allocation for the fixture, serialized as the procedure answers with them.
 */

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** criterion 5's contract: twelve months on a quarterly interval, four cycles of 3,000. */
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

const VALUE: PrintedScheduleValue = {
	issuer: 'Al Nakheel Properties',
	contract: {
		govId: '20471133',
		start: day('2026-01-01').getTime(),
		end: day('2026-12-31').getTime()
	},
	tenant: { name: 'Noura Al-Qahtani' },
	units: [
		{ name: 'A-12', complexName: 'Al Nakheel' },
		{ name: 'A-13', complexName: 'Al Nakheel' }
	],
	cycles: scheduleContract(QUARTERLY, PAYMENTS, day('2026-05-10')).cycles.map((cycle) => ({
		...cycle,
		due: cycle.due.getTime()
	}))
};

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const printed = (locale: Locales) => render(PrintedSchedule, { value: VALUE, locale });

const rows = () => [...document.querySelectorAll<HTMLElement>('tbody tr[data-cycle]')];
const cell = (row: HTMLElement, name: string) =>
	row.querySelector(`[${name}]`)?.textContent?.trim();

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const page = () => document.querySelector<HTMLElement>('[data-printed-schedule]')!;

test('every cycle of the contract is a row, with its due date, amount, what is paid, and its state', () => {
	printed('en');

	const money = (value: number) => formatLocaleMoney('en', value);

	expect(
		rows().map((row) => [
			cell(row, 'data-cycle-due'),
			cell(row, 'data-cycle-amount'),
			cell(row, 'data-cycle-covered'),
			row.dataset.state
		])
	).toEqual([
		[formatRecordDate('en', day('2026-01-01')), money(3000), money(3000), 'paid'],
		[formatRecordDate('en', day('2026-04-01')), money(3000), money(1000), 'late'],
		[formatRecordDate('en', day('2026-07-01')), money(3000), money(0), 'upcoming'],
		[formatRecordDate('en', day('2026-10-01')), money(3000), money(0), 'upcoming']
	]);

	// on paper a state is a word rather than the pane's glyph.
	expect(cell(rows()[1], 'data-cycle-state')).toBe(en.contracts.schedule.states.late);
});

test('a schedule chosen in English is entirely in English, headed by who keeps it', () => {
	printed('en');

	expect(page().getAttribute('lang')).toBe('en');
	expect(page().getAttribute('dir')).toBe('ltr');
	expect(text(page())).not.toMatch(/[؀-ۿ]/);
	expect(text(page().querySelector('header [data-printed-issuer]'))).toBe('Al Nakheel Properties');
	expect(text(page().querySelector('h1'))).toBe(en.contracts.schedule.printTitle);
	expect([...page().querySelectorAll('thead th')].map(text)).toEqual(
		(['due', 'amount', 'covered', 'state'] as const).map(
			(column) => en.contracts.schedule.columns[column]
		)
	);
});

test('the page names the contract, its tenant and every unit it holds', () => {
	printed('en');

	expect(text(page())).toContain('20471133');
	expect(document.querySelector('[data-printed-tenant]')?.textContent?.trim()).toBe(
		'Noura Al-Qahtani'
	);
	expect(
		[...document.querySelectorAll('[data-printed-units] > span')].map((unit) =>
			unit.textContent?.trim()
		)
	).toEqual(['A-12 · Al Nakheel', 'A-13 · Al Nakheel']);
});

test('chosen in Arabic, it reads right to left in Arabic alone, with every figure in Western digits', () => {
	printed('ar');

	expect(page().getAttribute('lang')).toBe('ar');
	expect(page().getAttribute('dir')).toBe('rtl');
	expect(text(page().querySelector('h1'))).toBe(ar.contracts.schedule.printTitle);
	expect([...page().querySelectorAll('thead th')].map(text)).toEqual(
		(['due', 'amount', 'covered', 'state'] as const).map(
			(column) => ar.contracts.schedule.columns[column]
		)
	);
	expect(cell(rows()[1], 'data-cycle-state')).toBe(ar.contracts.schedule.states.late);

	// no Arabic-Indic or Extended Arabic-Indic digit anywhere on the page.
	expect(text(page())).not.toMatch(/[٠-٩۰-۹]/);
	expect(cell(rows()[0], 'data-cycle-amount')).toBe(formatLocaleMoney('ar', 3000));
	expect(cell(rows()[0], 'data-cycle-amount')).toMatch(/3,000/);
	expect(cell(rows()[1], 'data-cycle-due')).toBe(formatRecordDate('ar', day('2026-04-01')));
	expect(rows()).toHaveLength(4);
});
