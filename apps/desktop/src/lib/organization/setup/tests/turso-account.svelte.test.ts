import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationForgetAccount from '$lib/organization/setup/component/forget-account.svelte';
import OrganizationTursoAccount from '$lib/organization/setup/component/turso-account.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE TURSO ACCOUNT, AS A CONNECTION
 *
 * Ticket 05 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], criteria 13
 * and 2, as ticket 38 folded the Turso account into the owner's leaving card: one row named for the
 * account, its value its state on this machine; where it is held, forgetting it is an ending row,
 * its button red words alone, asked first with the sentence naming where the token is revoked;
 * where it is not, the row carries a reconnect in words alone, and the consent's pending line and
 * its refusal sit under that row. Where the rows stand in the card is the area test's.
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
		{
			holdsAuthority,
			organizationId: 'org-id-1',
			organizationName: 'Acme Rentals',
			onReconnected: () => {}
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const forgetShown = () =>
	render(
		OrganizationForgetAccount,
		{},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];
const nameOf = (row: Element) =>
	row.querySelector('[data-slot=item-title] > span')?.textContent?.trim();
const valueOf = (row: Element) => row.querySelector('[data-row-value]')?.textContent?.trim();

test('held here: the row is named for the account and reads connected on this machine', () => {
	shown(true);

	const [account] = rows();

	expect(rows()).toHaveLength(1);
	expect(account.getAttribute('data-turso-account')).toBe('held');
	expect(nameOf(account)).toBe(en.organization.dashboard.authorityTitle);
	expect(valueOf(account)).toBe(en.organization.dashboard.authorityConnected);
	expect(account.dataset.rowTone).toBe('neutral');
	// a state, and nothing to press but the fold.
	expect(account.querySelectorAll('button:not([data-row-details-trigger])')).toHaveLength(0);
});

// effort 846, *Detail that few readers need folds under its row*: what the account holds for this
// organization is under the connected row, closed until asked for.
test('held here: what the account holds folds under the connected row', async () => {
	shown(true);

	const [account] = rows();
	const chevron = account.querySelector<HTMLElement>('[data-row-details-trigger]')!;

	expect(chevron.getAttribute('aria-expanded')).toBe('false');
	expect(chevron.getAttribute('aria-label')).toBe(en.organization.dashboard.authorityDetail.label);
	expect(account.querySelector('[data-turso-detail]')).toBeNull();

	await fireEvent.click(chevron);

	const detail = account.querySelector('[data-turso-detail]')!;

	expect(detail.textContent).toContain('org-org-id-1');
	expect(detail.textContent).toContain('Acme Rentals');
});

test('forget is an error row whose button is red words alone, labelled by its row', () => {
	forgetShown();

	const [forget] = rows();

	expect(nameOf(forget)).toBe(en.organization.dashboard.forgetAccount);
	expect(forget.dataset.rowTone).toBe('error');
	expect(forget.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(forget.querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
		en.organization.dashboard.forgetAccountDescription
	);

	const button = screen.getByRole('button', { name: en.organization.dashboard.forgetAccount });

	expect(button.textContent?.trim()).toBe(en.organization.dashboard.forget);
	expect(button.querySelector('svg')).toBeNull();
	expect(button.className).toContain('text-destructive');
});

test('forget asks first, naming where the token is revoked, and forgets once answered', async () => {
	forgetShown();

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

test('not held here: the row reads so, says why, and reconnects in words alone', () => {
	shown(false);

	const [account] = rows();

	expect(rows()).toHaveLength(1);
	expect(account.getAttribute('data-turso-account')).toBe('not-held');
	expect(nameOf(account)).toBe(en.organization.dashboard.authorityTitle);
	expect(valueOf(account)).toBe(en.organization.dashboard.authorityNotHeld);
	expect(account.querySelector('[data-row-meta]')?.textContent).toContain(
		en.organization.dashboard.authorityFollowsTheAccount
	);
	// nothing is held here, so nothing folds under it.
	expect(account.querySelector('[data-row-details-trigger]')).toBeNull();

	const reconnect = account.querySelector<HTMLElement>('[data-reconnect-authority-open]')!;

	expect(reconnect.textContent?.trim()).toBe(en.organization.dashboard.reconnect);
	expect(reconnect.querySelector('svg')).toBeNull();
	expect(document.querySelector('[data-row-tone=error]')).toBeNull();
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
		expect(account.querySelector('[data-reconnect-authority-open]')).not.toBeNull();
	});
}
