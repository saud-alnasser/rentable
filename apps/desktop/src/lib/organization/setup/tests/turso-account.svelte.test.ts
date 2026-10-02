import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationTursoAccount from '$lib/organization/setup/component/turso-account.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE TURSO ACCOUNT, AS A CONNECTION
 *
 * Ticket 05 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], criteria 13
 * and 2 for the owner's Turso group: one row naming the account and its state on this machine;
 * where it is held, forgetting it is the group's end row, in the error tone, asked first with the
 * sentence naming where the token is revoked; where it is not, the row carries a reconnect with
 * its glyph, and the consent's pending line and its refusal sit under that row.
 *
 * **What reaches Rust is stood in for** at the way in's hooks, and the browser at `tauri`. How
 * far the consent has got is `answers.consent`, which the stand-in for the poll reads.
 */

const answers = vi.hoisted(() => ({
	consent: 'pending' as 'pending' | 'granted' | 'abandoned' | 'failed',
	forgotten: 0,
	opened: [] as string[]
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		opener: {
			openUrl: async (url: string) => {
				answers.opened.push(url);
			}
		}
	}
}));

vi.mock('$lib/organization/setup/query', () => {
	const idle = { isPending: false };

	return {
		useBeginConsent: () => ({
			...idle,
			mutateAsync: async () => ({ sessionId: 'consent-1', authorizationUrl: 'https://turso' })
		}),
		useConsentResult: (sessionId: () => string | null) => ({
			get data() {
				return sessionId() ? { status: answers.consent } : undefined;
			}
		}),
		useReconnectAuthority: () => ({ ...idle, mutateAsync: async () => undefined }),
		useDisconnect: () => ({
			...idle,
			mutateAsync: async () => {
				answers.forgotten += 1;
			}
		})
	};
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	answers.consent = 'pending';
	answers.forgotten = 0;
	answers.opened = [];
	document.body.innerHTML = '';
});

const shown = (holdsAuthority: boolean) =>
	render(
		OrganizationTursoAccount,
		{ holdsAuthority, onReconnected: () => {} },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];
const nameOf = (row: Element) => row.querySelector('[data-slot=item-title]')?.textContent?.trim();
const valueOf = (row: Element) => row.querySelector('[data-row-value]')?.textContent?.trim();

test('held here: the account reads connected, and forget is the last row, in the error tone', () => {
	shown(true);

	const [account, forget] = rows();

	expect(rows().map(nameOf)).toEqual([
		en.organization.dashboard.authorityTitle,
		en.organization.dashboard.forgetAccount
	]);
	expect(valueOf(account)).toBe(en.organization.dashboard.authorityConnected);
	expect(account.dataset.rowTone).toBe('neutral');
	expect(forget.dataset.rowTone).toBe('error');
	expect(forget.previousElementSibling?.getAttribute('data-slot')).toBe('item-separator');
	expect(forget.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(forget.querySelector('button svg')).not.toBeNull();
	// labelled by its row, so a reader hears what it forgets rather than the verb alone.
	expect(
		screen.getByRole('button', { name: en.organization.dashboard.forgetAccount })
	).toBeDefined();
	expect(document.querySelector('[data-turso-account]')?.textContent).toContain(
		en.organization.dashboard.forgetAccountDescription
	);
});

test('forget asks first, naming where the token is revoked, and forgets once answered', async () => {
	shown(true);

	await fireEvent.click(document.querySelector('[data-forget-account-open]')!);

	const dialog = await screen.findByRole('dialog');

	expect(answers.forgotten).toBe(0);
	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokes);
	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokesAt);

	await fireEvent.click(
		within(dialog).getByRole('button', { name: en.organization.dashboard.forgetAccount })
	);

	await waitFor(() => expect(answers.forgotten).toBe(1));
});

test('not held here: the account reads so, with a reconnect carrying its glyph, and no end', () => {
	shown(false);

	const [account] = rows();

	expect(rows()).toHaveLength(1);
	expect(nameOf(account)).toBe(en.organization.dashboard.authorityTitle);
	expect(valueOf(account)).toBe(en.organization.dashboard.authorityNotHeld);

	const reconnect = account.querySelector<HTMLElement>('[data-reconnect-authority-open]')!;

	expect(reconnect.textContent?.trim()).toBe(en.organization.dashboard.reconnect);
	expect(reconnect.querySelector('svg')).not.toBeNull();
	expect(document.querySelector('[data-row-tone=error]')).toBeNull();
	expect(document.querySelector('[data-forget-account-open]')).toBeNull();
	expect(account.querySelector('[data-row-beneath]')).toBeNull();
});

test('while the consent is out, the pending line sits under the row', async () => {
	shown(false);

	await fireEvent.click(document.querySelector('[data-reconnect-authority-open]')!);

	const [account] = rows();

	await waitFor(() =>
		expect(account.querySelector('[data-row-beneath] [data-consent-pending]')).not.toBeNull()
	);
	expect(answers.opened).toEqual(['https://turso']);
	expect(account.textContent).toContain(en.organization.setup.connecting);
});

for (const [status, sentence] of [
	['abandoned', en.organization.setup.consentAbandoned],
	['failed', en.organization.setup.consentFailed]
] as const) {
	test(`a consent ${status} is said in a callout under the row`, async () => {
		answers.consent = status;
		shown(false);

		await fireEvent.click(document.querySelector('[data-reconnect-authority-open]')!);

		const [account] = rows();

		await waitFor(() =>
			expect(
				account.querySelector('[data-row-beneath] [data-slot=callout]')?.textContent
			).toContain(sentence)
		);
		// and the reconnect is still there to try again.
		expect(account.querySelector('[data-reconnect-authority-open] svg')).not.toBeNull();
	});
}
