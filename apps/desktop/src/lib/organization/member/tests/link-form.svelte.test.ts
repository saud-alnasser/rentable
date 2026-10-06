import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import LinkForm from '$lib/organization/member/component/link-form.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * HOW LONG A LINK LASTS, CHOSEN BEFORE IT IS MADE
 *
 * Effort 851, requirement 11 and criterion 11: making a link asks how long it and its code last.
 * The choice is a slider over every hour from one to twenty-three, every day from one to six and a
 * week, in that order and nothing else, starts at three days, and says the one it stands on in the
 * reader's language with Western digits in both ([[rules/frontend]], *i18n*). The thumb is driven
 * by its arrow keys, which jsdom delivers where it lays nothing out to drag across. What is chosen
 * is what the act is handed.
 */

beforeEach(() => {
	// bits-ui measures the thumb with this, and jsdom carries none.
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

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

const thumb = () => screen.getByRole('slider');
const shown = () => document.querySelector('[data-link-lifetime-shown]')?.textContent?.trim();
const end = (which: 'first' | 'last') =>
	document.querySelector(`[data-link-lifetime-end=${which}]`)?.textContent?.trim();

/** every lifetime the slider stands on, from its first step to its last, as hours and as shown. */
const offered = async (key: 'ArrowRight' | 'ArrowLeft') => {
	await fireEvent.keyDown(thumb(), { key: 'Home' });

	const steps = [];

	for (let index = 0; index < 30; index++) {
		steps.push({
			hours: Number(
				document.querySelector<HTMLElement>('[data-link-lifetime]')!.dataset.linkLifetime
			),
			label: shown(),
			spoken: thumb().getAttribute('aria-valuetext')
		});
		await fireEvent.keyDown(thumb(), { key });
	}

	return steps;
};

const HOURS = [
	...Array.from({ length: 23 }, (_, index) => index + 1),
	24,
	48,
	72,
	96,
	120,
	144,
	168
];

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
	expect(shown()).toBe('3 days');
	expect(thumb().getAttribute('aria-valuetext')).toBe('3 days');
	expect(end('first')).toBe('1 hour');
	expect(end('last')).toBe('1 week');

	expect(await offered('ArrowRight')).toEqual(
		HOURS.map((hours, index) => ({ hours, label: ENGLISH[index], spoken: ENGLISH[index] }))
	);

	// past the last step the thumb stays on a week.
	expect(shown()).toBe('1 week');

	await fireEvent.keyDown(thumb(), { key: 'Home' });
	for (let index = 0; index < 4; index++) await fireEvent.keyDown(thumb(), { key: 'ArrowRight' });
	expect(shown()).toBe('5 hours');

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

	const atStart = shown() ?? '';

	expect(atStart).toContain('3');
	expect(atStart).not.toBe('3 days');
	expect(atStart).not.toMatch(/[٠-٩]/);

	// in arabic the start is on the right, so the left arrow steps toward a week.
	const labels = await offered('ArrowLeft');

	expect(labels.map(({ hours }) => hours)).toEqual(HOURS);
	expect(labels.every(({ label }) => label && !/[٠-٩]/.test(label) && /[؀-ۿ]/.test(label))).toBe(
		true
	);
	expect(labels.find(({ hours }) => hours === 5)?.label).toContain('5');
	expect(end('first')).toMatch(/[؀-ۿ]/);

	setLocale('en');
});
