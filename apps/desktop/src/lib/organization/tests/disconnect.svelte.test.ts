import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { TRPCError } from '@trpc/server';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Disconnect from '$lib/organization/component/disconnect.svelte';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE PAGE'S DISCONNECT, RENDERED
 *
 * Requirement 20 of the redesign, the organization page's half: the section says what
 * disconnecting forgets, its control opens the one confirm every destructive act asks on, the
 * confirm names the organization and says what it costs, and confirming calls the port once.
 * Cancelling calls nothing. Both locales. What happens after the port answers is the route's,
 * which is not rendered here.
 */

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const section = (
	overrides: Partial<Parameters<typeof render<typeof Disconnect>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Disconnect,
		{ organizationName: 'Acme Rentals', onDisconnect: async () => {}, ...overrides },
		inProvider(direction)
	);

const dialog = () => document.querySelector('[data-slot="dialog-content"]');
const paragraphs = () => Array.from(document.querySelectorAll('[data-slot="dialog-content"] p'));
const footer = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

test('the section says what disconnecting forgets and offers the one control, with its verb', () => {
	loadLocale('en');
	setLocale('en');
	section();

	expect(screen.getByText(en.organization.dashboard.disconnectForgets)).toBeDefined();

	const opener = document.querySelector('[data-disconnect-open]')!;

	expect(opener.textContent?.trim()).toBe(en.organization.dashboard.disconnect);
	// requirement 14: the verb's glyph before its label.
	expect(opener.querySelector('svg')).not.toBeNull();
	// nothing asks until the control is pressed.
	expect(dialog()).toBeNull();
});

test('pressing the control asks once, naming the organization and what it costs', async () => {
	loadLocale('en');
	setLocale('en');
	section();

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);

	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});
	expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe(
		toTitleCase(en.layout.signIn.disconnect)
	);
	expect(paragraphs()[0]?.textContent?.trim()).toBe('Acme Rentals');
	expect(paragraphs()[1]?.textContent?.trim()).toBe(en.layout.signIn.disconnectDescription);
	// the destructive control is the last in the footer, named by the verb.
	expect(footer().at(-1)?.textContent?.trim()).toBe(en.layout.signIn.disconnect);
});

test('confirming calls the port once, and cancelling calls nothing', async () => {
	loadLocale('en');
	setLocale('en');

	let disconnected = 0;
	section({
		onDisconnect: async () => {
			disconnected++;
		}
	});

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);
	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});

	// leaving is the first control in the footer; it closes the confirm and runs nothing.
	await fireEvent.click(footer()[0]!);
	await waitFor(() => {
		expect(dialog()).toBeNull();
	});
	expect(disconnected).toBe(0);

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);
	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});
	await fireEvent.click(footer().at(-1)!);

	await waitFor(() => {
		expect(disconnected).toBe(1);
	});
	await waitFor(() => {
		expect(dialog()).toBeNull();
	});
});

// a refusal the person can act on is a `BAD_REQUEST`, which the confirm shows verbatim rather
// than closing over; anything else is the shared handler's toast, and the confirm still stays.
test('a refused disconnect leaves the confirm open with the refusal on it', async () => {
	loadLocale('en');
	setLocale('en');
	section({
		onDisconnect: async () => {
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'the replica is still open' });
		}
	});

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);
	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});
	await fireEvent.click(footer().at(-1)!);

	await waitFor(() => {
		expect(dialog()?.textContent).toContain('the replica is still open');
	});
	expect(dialog()).not.toBeNull();
});

test('and in arabic, the section and the confirm read in their own words', async () => {
	loadLocale('ar');
	setLocale('ar');
	section({}, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.disconnectForgets)).toBeDefined();
	expect(ar.organization.dashboard.disconnectForgets).not.toBe(
		en.organization.dashboard.disconnectForgets
	);

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);

	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});
	expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe(
		ar.layout.signIn.disconnect
	);
	expect(paragraphs()[1]?.textContent?.trim()).toBe(ar.layout.signIn.disconnectDescription);
	expect(footer().at(-1)?.textContent?.trim()).toBe(ar.layout.signIn.disconnect);

	setLocale('en');
});
