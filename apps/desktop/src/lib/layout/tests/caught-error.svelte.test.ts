import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '$lib/organization/tests/providers.svelte';

import CaughtError from '../component/caught-error.svelte';

/**
 * A SCREEN THAT COULD NOT BE DRAWN KEEPS THE THROWN MESSAGE CLOSED
 *
 * Ticket 39 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 23:
 * the caught render error drew whatever was thrown, a developer's English, beside its sentence in
 * both locales. It shares one treatment with the routes' `+error.svelte` (ticket 33), so it keeps
 * the message behind the details disclosure as that page does ([[rules/interface]], *Error*).
 */

const THROWN = 'Cannot read properties of undefined (reading "name")';

beforeEach(() => {
	loadLocale('ar');
	setLocale('ar');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const draw = (hasWorkingShell: boolean, onRetry = () => {}) =>
	render(
		CaughtError,
		{ error: new Error(THROWN), onRetry, hasWorkingShell },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'rtl' } }
	);

test('in Arabic, a screen that threw says the sentence and keeps the thrown English behind the details', async () => {
	draw(true);

	expect(document.body.textContent).toContain(ar.layout.error.title);
	expect(document.body.textContent).toContain(ar.layout.error.description);
	expect(document.body.textContent).not.toContain(THROWN);

	await fireEvent.click(screen.getByRole('button', { name: ar.common.actions.details }));

	expect(document.querySelector('[data-error-detail-text="caught"]')?.textContent?.trim()).toBe(
		THROWN
	);
});

test('with the shell standing it offers home and retry, retry last, and retry draws it again', async () => {
	const onRetry = vi.fn();

	draw(true, onRetry);

	const home = screen.getByRole('link', { name: ar.layout.error.goHome });
	const retry = screen.getByRole('button', { name: ar.layout.error.retry });

	expect(home.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	await fireEvent.click(retry);

	expect(onRetry).toHaveBeenCalledOnce();
});

test('where the shell itself threw, it offers retry alone and still keeps the message closed', () => {
	draw(false);

	expect(document.body.textContent).toContain(ar.layout.error.shellTitle);
	expect(screen.queryByRole('link', { name: ar.layout.error.goHome })).toBeNull();
	expect(screen.getByRole('button', { name: ar.layout.error.retry })).toBeTruthy();
	expect(document.body.textContent).not.toContain(THROWN);
});
