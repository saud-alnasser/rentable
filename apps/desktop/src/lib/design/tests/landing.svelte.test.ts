import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { landing } from '$lib/design/landing.svelte';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import LandingHarness from './landing-harness.svelte';

/**
 * A CREATE'S REQUEST TO BE BROUGHT INTO VIEW IS ANSWERED ONCE OR DROPPED
 *
 * Ticket 39 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 16,
 * from review round one: the request stayed until some list showed the record. A tenant made from
 * the dashboard moved the focus when `/tenants` was opened much later, and a payment made while the
 * ledger's period hid it moved the focus when the filter was cleared. Each list now answers once,
 * from the set it holds, and the next navigation drops what nothing answered.
 *
 * **The navigation is mocked**: `onNavigate` has no router under this runner, so the callback the
 * layout registers is kept and called as a navigation would call it.
 */

const { navigations } = vi.hoisted(() => ({ navigations: [] as (() => void)[] }));

vi.mock('$app/navigation', async (actual) => ({
	...(await actual<typeof import('$app/navigation')>()),
	onNavigate: (callback: () => void) => {
		navigations.push(callback);
	}
}));

const records = (...ids: string[]) => ids.map((id) => ({ id }));

// the turn `land` waits before posting, and the flush after it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const focusedText = () => document.activeElement?.textContent?.trim();

let restore: (() => void)[] = [];

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	navigations.length = 0;

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// jsdom lays nothing out, so the viewport is given a size the virtualiser can fill.
	const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	restore = [() => height.mockRestore(), () => width.mockRestore()];
});

afterEach(() => {
	landing.drop();
	restore.forEach((undo) => undo());
	document.body.innerHTML = '';
});

test('a list holding the created record brings it into view with the focus on it', async () => {
	const { rerender } = render(LandingHarness, { data: records('one', 'two') });

	// the create's refetch has arrived by the time its host hears of it.
	await rerender({ data: records('one', 'two', 'three') });
	landing.land('three');

	await waitFor(() => expect(focusedText()).toBe('three'));
	expect(landing.pending).toBeNull();
});

test('a list that does not hold the record is done with it, so a filter cleared later moves nothing', async () => {
	const { rerender } = render(LandingHarness, { data: records('one', 'two') });

	// the ledger's period hides the payment just made, so its refetch comes back without it.
	landing.land('three');
	await settle();

	// the filter is cleared, and the record arrives in the set.
	await rerender({ data: records('one', 'two', 'three') });
	await waitFor(() => expect(screen.getByText('three')).toBeTruthy());
	await settle();

	expect(focusedText()).not.toBe('three');
});

test('the next navigation drops a request nothing on screen answered', async () => {
	// a tenant made from the dashboard, where no set lists tenants.
	const { rerender } = render(LandingHarness, { data: records('one', 'two'), isShown: false });

	landing.land('three');
	await settle();
	expect(landing.pending).not.toBeNull();

	// the reader goes elsewhere, and much later opens the set that holds the record.
	expect(navigations).toHaveLength(1);
	navigations[0]();
	expect(landing.pending).toBeNull();

	await rerender({ data: records('one', 'two', 'three'), isShown: true });
	await waitFor(() => expect(screen.getByText('three')).toBeTruthy());
	await settle();

	expect(focusedText()).not.toBe('three');
});
