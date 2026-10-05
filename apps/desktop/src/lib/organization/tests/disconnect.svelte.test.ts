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

test('the section says what disconnecting forgets and offers the one control, its verb alone', () => {
	loadLocale('en');
	setLocale('en');
	section();

	// effort 846, requirement 14: a member is told the organization stays on Turso and a new link
	// brings them back, in the one line under the row.
	expect(document.querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
		en.organization.dashboard.disconnectComesBack
	);

	const opener = document.querySelector('[data-disconnect-open]')!;

	expect(opener.textContent?.trim()).toBe(en.organization.dashboard.disconnect);
	// ticket 38: red words and no glyph, since the row's own glyph already says what it is about.
	expect(opener.querySelector('svg')).toBeNull();
	expect(opener.className).toContain('text-destructive');
	// nothing asks until the control is pressed.
	expect(dialog()).toBeNull();
});

// and the owner, whose way back is not a link, is told nothing on Turso changes.
test('the owner reads that nothing on Turso changes', () => {
	loadLocale('en');
	setLocale('en');
	section({ isOwner: true });

	expect(document.querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
		en.organization.dashboard.disconnectForgets
	);
});

// an owner whose machine holds the organization's Turso consent is told it goes (effort 851,
// criterion 5); without it the sentence leaves the account out, as the arabic case below reads.
test('pressing the control asks once, naming the organization and what it costs', async () => {
	loadLocale('en');
	setLocale('en');
	section({ isOwner: true, holdsTursoAuthority: true });

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

// a refusal the person can act on is a `BAD_REQUEST`, which the confirm shows in the reader's
// words rather than closing over, never the message it was raised with (effort 832, requirement
// 23); anything else is the shared handler's toast, and the confirm still stays.
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
		expect(dialog()?.textContent).toContain(
			'something entered is not valid. check it and try again.'
		);
	});
	expect(dialog()?.textContent).not.toContain('the replica is still open');
});

test('and in arabic, the section and the confirm read in their own words', async () => {
	loadLocale('ar');
	setLocale('ar');
	section({}, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.disconnectComesBack)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.disconnectThisMachine)).toBeDefined();
	expect(ar.organization.dashboard.disconnectComesBack).not.toBe(
		en.organization.dashboard.disconnectComesBack
	);

	await fireEvent.click(document.querySelector('[data-disconnect-open]')!);

	await waitFor(() => {
		expect(dialog()).not.toBeNull();
	});
	expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe(
		ar.layout.signIn.disconnect
	);
	// a member holds no Turso consent, so the confirm does not say the account goes.
	expect(paragraphs()[1]?.textContent?.trim()).toBe(ar.layout.signIn.disconnectDescriptionNoTurso);
	expect(footer().at(-1)?.textContent?.trim()).toBe(ar.layout.signIn.disconnect);

	setLocale('en');
});
