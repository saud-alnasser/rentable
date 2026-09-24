import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '$lib/organization/tests/providers.svelte';

import ErrorPage from '../../../routes/+error.svelte';

/**
 * AN ADDRESS THAT LEADS NOWHERE
 *
 * Ticket 30 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], after its walk:
 * a missing record and an unknown route were two treatments, one inline with two ways back and
 * one the application's failure card with a primary button. They are one now, the design
 * package's `not-found.svelte`, and the record's half is read in that package's own tests. This
 * is the route's half: the same block, the same one way back, which goes where back goes and
 * falls to the dashboard where there is nowhere to return to.
 *
 * **The address and the navigation are mocked**: `$app/state` carries no navigation under this
 * runner, and `goto` has no router to reach, so what it was asked is recorded.
 */

const { address, navigations } = vi.hoisted(() => ({
	address: { status: 404 },
	navigations: [] as string[]
}));

vi.mock('$app/state', () => ({
	page: {
		get status() {
			return address.status;
		},
		error: { message: 'Not Found' }
	}
}));

vi.mock('$app/navigation', () => ({
	goto: async (url: string) => {
		navigations.push(url);
	}
}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	address.status = 404;
	navigations.length = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
});

const page = () =>
	render(ErrorPage, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

test('an unknown address says the page does not exist, in the not-found block', () => {
	page();

	const empty = document.querySelector('[data-empty]');

	expect(empty?.getAttribute('data-empty')).toBe('not-found');
	expect(empty?.textContent).toContain(en.layout.notFound.title);
	expect(empty?.textContent).toContain(en.layout.notFound.description);
	// not the application's failure card, which is what a screen that crashed gets.
	expect(document.body.textContent).not.toContain(en.layout.error.title);
});

test('an unknown address offers one way back, the back control, and it falls to the dashboard', async () => {
	page();

	const controls = document.querySelectorAll('[data-back-control]');

	expect(controls).toHaveLength(1);
	expect(controls[0].closest('[data-empty="not-found"]')).not.toBeNull();
	// the words the record's way back wears, from the one string contract.
	expect(controls[0].textContent?.trim()).toBe(strings.goBack);
	expect(screen.queryByRole('link', { name: en.layout.error.goHome })).toBeNull();

	await fireEvent.click(controls[0]);

	// nothing was visited before it here, so back has nowhere to return to and takes the dashboard.
	expect(navigations).toEqual(['/']);
});

test('a screen that failed is still the failure card, not a missing page', () => {
	address.status = 500;
	page();

	expect(document.querySelector('[data-empty]')).toBeNull();
	expect(document.body.textContent).toContain(en.layout.error.title);
});
