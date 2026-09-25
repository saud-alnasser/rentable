import { render } from '@testing-library/svelte';
import Providers from './providers.svelte';
import UsersIcon from '@lucide/svelte/icons/users';
import { beforeEach, expect, test } from 'vitest';
import * as Cell from '$lib/design/cell/index.ts';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

/**
 * THE FIGURES RULE
 *
 * An amount and a count are read down a column against the ones above and below them, so each
 * figure asks for tabular numerals rather than letting its digits take their own widths. What is
 * asserted is the request, `tabular-nums` on the element holding the figure: jsdom lays nothing
 * out, so how wide a digit came out is not observable here.
 */

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

// the element whose own text is the figure, as against the screen reader's copy beside it.
function figureHolding(container: HTMLElement, text: string) {
	return [...container.querySelectorAll('span')].find(
		(span) => span.textContent?.trim() === text && !span.classList.contains('sr-only')
	);
}

test('an amount asks for tabular numerals', () => {
	const { container } = render(Cell.Money, { amount: 1250 });
	const figure = container.querySelector('span');

	expect(figure?.textContent).toMatch(/1,250/);
	expect(figure?.classList).toContain('tabular-nums');
});

test('a count asks for tabular numerals', () => {
	const { container } = render(
		Cell.Count,
		{ icon: UsersIcon, count: 1234, label: 'tenants' },
		{ wrapper: Providers }
	);

	expect(figureHolding(container, '1,234')?.classList).toContain('tabular-nums');
});

test('a count by status asks for tabular numerals', () => {
	const { container } = render(
		Cell.StatusCount,
		{ status: 'active', count: 42 },
		{ wrapper: Providers }
	);

	expect(figureHolding(container, '42')?.classList).toContain('tabular-nums');
});
