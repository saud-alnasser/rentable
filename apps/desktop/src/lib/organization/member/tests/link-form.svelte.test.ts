import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import LinkForm from '$lib/organization/member/component/link-form.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';

/**
 * HOW LONG A LINK LASTS, CHOSEN BEFORE IT IS MADE
 *
 * Effort 851, requirement 11 and criterion 11: making a link asks how long it and its code last.
 * The choice offers every hour from one to twenty-three, every day from one to six and a week, in
 * that order and nothing else, starts at three days, and says each in the reader's language with
 * Western digits in both ([[rules/frontend]], *i18n*). What is chosen is what the act is handed.
 */

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const form = (onMake: (hours: number) => void = () => {}, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		LinkForm,
		{ open: true, onOpenChange: () => {}, username: 'sami.staff', isMaking: false, onMake },
		inProvider(direction)
	);

const trigger = () => document.querySelector<HTMLElement>('#link-lifetime')!;

const offered = () =>
	Array.from(document.querySelectorAll<HTMLElement>('[data-slot=select-item]')).map((item) => ({
		hours: Number(item.dataset.linkLifetimeOption),
		label: item.textContent?.trim()
	}));

const ENGLISH = [
	'1 hour',
	...Array.from({ length: 22 }, (_, index) => `${index + 2} hours`),
	'1 day',
	...Array.from({ length: 5 }, (_, index) => `${index + 2} days`),
	'1 week'
];

test('the lifetime offers every hour to a day, every day to a week and a week, starting at three days', async () => {
	loadLocale('en');
	setLocale('en');

	let made: number | null = null;
	form((hours) => (made = hours));

	expect(screen.getByText(en.organization.dashboard.linkLifetime)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.linkLifetimeDescription)).toBeDefined();
	expect(trigger().textContent?.trim()).toBe('3 days');

	await openSelect(trigger());

	expect(offered()).toEqual(
		[...Array.from({ length: 23 }, (_, index) => index + 1), 24, 48, 72, 96, 120, 144, 168].map(
			(hours, index) => ({ hours, label: ENGLISH[index] })
		)
	);

	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-link-lifetime-option="5"]')!
	);
	expect(trigger().textContent?.trim()).toBe('5 hours');

	await fireEvent.click(screen.getByRole('button', { name: en.organization.dashboard.makeLink }));
	expect(made).toBe(5);
});

test('made without touching the choice, a link lasts three days', async () => {
	loadLocale('en');
	setLocale('en');

	let made: number | null = null;
	form((hours) => (made = hours));

	await fireEvent.click(screen.getByRole('button', { name: en.organization.dashboard.makeLink }));
	expect(made).toBe(72);
});

test('in arabic the lifetimes read in arabic, in western digits, in the same order', async () => {
	loadLocale('ar');
	setLocale('ar');
	form(undefined, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.linkLifetime)).toBeDefined();
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');

	const shown = trigger().textContent?.trim() ?? '';

	expect(shown).toContain('3');
	expect(shown).not.toBe('3 days');
	expect(shown).not.toMatch(/[٠-٩]/);

	await openSelect(trigger());

	const labels = offered();

	expect(labels.map(({ hours }) => hours)).toEqual([
		...Array.from({ length: 23 }, (_, index) => index + 1),
		24,
		48,
		72,
		96,
		120,
		144,
		168
	]);
	expect(labels.every(({ label }) => label && !/[٠-٩]/.test(label) && /[؀-ۿ]/.test(label))).toBe(
		true
	);
	expect(labels.find(({ hours }) => hours === 5)?.label).toContain('5');

	setLocale('en');
});
