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
 * Ticket 05 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 7 and
 * criterion 7: the page the print act hands the sheet carries the contract, its tenant, its units
 * and every row of criterion 5's contract, headed in Arabic and in English, in Western digits
 * whichever language the reader chose. The printed page itself, through the dialog, is checked by
 * hand (criterion 10).
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

/** a heading's two lines: the Arabic one and the English one, each in its own language. */
function languages(heading: Element) {
	return {
		ar: heading.querySelector('[lang="ar"][dir="rtl"]')?.textContent?.trim(),
		en: heading.querySelector('[lang="en"][dir="ltr"]')?.textContent?.trim()
	};
}

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

	// on paper a state is a word, in both languages, rather than the pane's glyph.
	const state = rows()[1].querySelector('[data-cycle-state]');

	expect(state && languages(state)).toEqual({
		ar: ar.contracts.schedule.states.late,
		en: en.contracts.schedule.states.late
	});
});

test('every heading is in Arabic and in English, each in its own language and direction', () => {
	printed('en');

	const title = document.querySelector('h1');

	expect(title && languages(title)).toEqual({
		ar: ar.contracts.schedule.printTitle,
		en: en.contracts.schedule.printTitle
	});
	expect([...document.querySelectorAll('thead th')].map(languages)).toEqual(
		(['due', 'amount', 'covered', 'state'] as const).map((column) => ({
			ar: ar.contracts.schedule.columns[column],
			en: en.contracts.schedule.columns[column]
		}))
	);
	expect([...document.querySelectorAll('dt')].map(languages)).toEqual(
		(['contractNumber', 'contractPeriod', 'tenant', 'units'] as const).map((label) => ({
			ar: ar.common.labels[label],
			en: en.common.labels[label]
		}))
	);
});

test('the page names the contract, its tenant and every unit it holds', () => {
	printed('en');

	const text = document.body.textContent ?? '';

	expect(text).toContain('20471133');
	expect(document.querySelector('[data-printed-tenant]')?.textContent?.trim()).toBe(
		'Noura Al-Qahtani'
	);
	expect(
		[...document.querySelectorAll('[data-printed-units] > span')].map((unit) =>
			unit.textContent?.trim()
		)
	).toEqual(['A-12 · Al Nakheel', 'A-13 · Al Nakheel']);
});

test('read in Arabic, the headings are still in both languages and every figure is in Western digits', () => {
	printed('ar');

	const text = document.body.textContent ?? '';

	// no Arabic-Indic or Extended Arabic-Indic digit anywhere on the page.
	expect(text).not.toMatch(/[٠-٩۰-۹]/);
	expect(cell(rows()[0], 'data-cycle-amount')).toBe(formatLocaleMoney('ar', 3000));
	expect(cell(rows()[0], 'data-cycle-amount')).toMatch(/3,000/);
	expect(cell(rows()[1], 'data-cycle-due')).toBe(formatRecordDate('ar', day('2026-04-01')));
	expect(cell(rows()[1], 'data-cycle-due')).toMatch(/2026/);
	expect(rows()).toHaveLength(4);

	expect([...document.querySelectorAll('thead th')].map(languages)[0]).toEqual({
		ar: ar.contracts.schedule.columns.due,
		en: en.contracts.schedule.columns.due
	});
});
