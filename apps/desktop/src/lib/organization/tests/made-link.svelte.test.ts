import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { formatRecordDate } from '$lib/design/date';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import MadeLink from '$lib/organization/component/made-link.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE LINK AND THE CODE, HANDED OVER
 *
 * Effort 828, requirements 1 and 20: what one link act puts on the screen. One link as a machine
 * string with one copy control, the code under it with none, the date the pair lapses, and the
 * statement that nothing was sent, which is the half a screen can get wrong on its own (effort
 * 826, requirement 8).
 *
 * **One panel for both kinds.** The panel is handed a link, a code and a moment and says nothing
 * about whether the link asks for a password or lands its machine at the wall, because what the
 * person handing it over does is the same either way.
 */

const noop = () => {};

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

/** when the link and its code lapse: a week out, which is what a link stands for. */
const LAPSES_AT = Date.UTC(2026, 8, 22);

const made = {
	link: 'rentable://join/abc',
	code: '7K4M9Q',
	expiresAt: LAPSES_AT
};

const panel = (
	overrides: Partial<Parameters<typeof render<typeof MadeLink>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		MadeLink,
		{
			organizationName: 'Northwind',
			made,
			onDismiss: noop,
			...overrides
		},
		inProvider(direction)
	);

test('the panel shows one link, one copy control and the statement that nothing was sent, until dismissed', async () => {
	loadLocale('en');
	setLocale('en');

	let dismissed = 0;
	panel({ onDismiss: () => dismissed++ });

	expect(document.querySelector('[data-link-handover]')).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.cannotSend)).toBeDefined();
	// the organization the link admits into leads the panel: the link itself is opaque.
	expect(document.querySelector('[data-invited-organization]')?.textContent).toBe('Northwind');

	const link = document.querySelector('[data-invited-link]');

	expect(link?.textContent).toBe(made.link);
	expect(link?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByText(en.organization.join.linkLabel)).toBeDefined();
	// effort 826, requirement 8: one link, one copy control, and no password anywhere on the
	// panel, by element or by word.
	expect(screen.getByRole('button', { name: en.organization.setup.copyLink })).toBeDefined();
	expect(document.querySelector('[data-invited-password]')).toBeNull();
	expect(
		Array.from(document.querySelectorAll('[data-link-handover] button')).filter((button) =>
			button.querySelector('svg')
		)
	).toHaveLength(1);

	// the panel stays until its own done control, which is the dismissal.
	expect(dismissed).toBe(0);
	await fireEvent.click(screen.getByRole('button', { name: en.organization.dashboard.done }));
	expect(dismissed).toBe(1);
});

// effort 828, requirement 1: the code is under the link, large enough to read out, beside the date
// the pair lapses. It has no copy control of its own, because a code copied is a code pasted beside
// the link, which is the one thing it must not be, and no control makes a fresh one, because a
// fresh code would be a fresh link text to re-send.
test('the code is under the link, with the date the pair lapses and no control to refresh it', () => {
	loadLocale('en');
	setLocale('en');
	panel();

	const link = document.querySelector('[data-invited-link]')!;
	const code = document.querySelector('[data-invited-code]')!;

	expect(code.textContent?.trim()).toBe('7K4M9Q');
	expect(code.getAttribute('dir')).toBe('ltr');
	// under the link, in the document's own order.
	expect(link.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getByText(en.organization.dashboard.codeTitle)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.codeDescription)).toBeDefined();

	// the date the link and the code lapse, said as the locale says a date.
	expect(document.querySelector('[data-invited-expiry]')?.textContent?.trim()).toBe(
		en.organization.dashboard.invitationExpires.replace(
			'{date:string}',
			formatRecordDate('en', LAPSES_AT)
		)
	);

	// no countdown, no fresh-code control, and no copy control for the code: the link has the only
	// one on the panel.
	expect(document.querySelector('[data-invited-code-seconds]')).toBeNull();
	expect(document.querySelector('[data-invited-fresh-code]')).toBeNull();
	expect(document.querySelector('[data-invited-code-block]')?.querySelector('button')).toBeNull();
});

test('the same panel in arabic says the same, and the link still reads left to right', () => {
	loadLocale('ar');
	setLocale('ar');
	panel({}, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.cannotSend)).toBeDefined();
	expect(ar.organization.dashboard.cannotSend).not.toBe(en.organization.dashboard.cannotSend);
	expect(screen.getByText(ar.organization.join.linkLabel)).toBeDefined();
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');
	expect(document.querySelector('[data-invited-link]')?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: ar.organization.setup.copyLink })).toBeDefined();

	setLocale('en');
});

test('nothing is drawn while there is no pair to show', () => {
	loadLocale('en');
	setLocale('en');
	panel({ made: null });

	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(document.querySelector('[data-link-handover]')).toBeNull();
});
