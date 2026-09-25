import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import ContractHost from '$lib/contract/component/host.svelte';
import { contractHost, contractHostState } from '$lib/contract/host.svelte';
import type { ContractActRecord } from '$lib/contract/acts';
import type { ContractReminder } from '$lib/contract/reminder';
import Section from '$lib/dashboard/component/section.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * A TENANT IS REMINDED ON WHATSAPP
 *
 * Requirement 12 of effort 835: the reminder act, asked of the contract host the frame mounts,
 * reads what the reminder states and opens WhatsApp through the opener, addressed to the tenant
 * and written in the language the application is showing; and the landing screen's rows offer it
 * as they offer renew.
 *
 * **What reaches Rust is stood in for** at `tauri` (`opened` notes each address the opener was
 * handed), and **the reminder read is stood in for** at the caller, since what it states is the
 * router's and `router.test.ts` holds it.
 */

const hooks = vi.hoisted(() => ({
	opened: [] as string[],
	reminder: vi.fn()
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		opener: {
			openUrl: async (url: string) => {
				hooks.opened.push(url);
			}
		}
	}
}));

vi.mock('$lib/api/caller', () => ({
	default: { contract: { reminder: hooks.reminder } }
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/dashboard') }
}));

vi.mock('$app/paths', async (original) => ({
	...(await original<Record<string, unknown>>()),
	resolve: (path: string) => path
}));

loadLocale('en');
loadLocale('ar');

const REMINDER: ContractReminder = {
	rank: 'owing',
	tenantName: 'Noura',
	tenantPhone: '+966551234567',
	unitNames: ['A-101'],
	amount: 1500,
	due: Date.UTC(2026, 2, 1)
};

const OWING: ContractActRecord = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m',
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	tenantId: 'tenant-1',
	rank: 'owing'
};

beforeEach(() => {
	hooks.opened.length = 0;
	hooks.reminder.mockReset();
	hooks.reminder.mockResolvedValue(REMINDER);
});

afterEach(() => {
	setLocale('en');
});

const renderHost = () =>
	render(
		ContractHost,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

/** the message a WhatsApp address carries, decoded as WhatsApp decodes it. */
const textOf = (url: string) => new URL(url).searchParams.get('text');

test('the reminder opens WhatsApp addressed to the tenant, with the message written in English', async () => {
	setLocale('en');
	renderHost();

	expect(contractHost.run('contract.remind', OWING)).toBe(true);

	await waitFor(() => expect(hooks.opened).toHaveLength(1));

	const [url] = hooks.opened;

	expect(hooks.reminder).toHaveBeenCalledWith({ id: 'contract-1' });
	expect(url.startsWith('https://wa.me/966551234567?text=')).toBe(true);
	expect(textOf(url)).toBe(
		'Hello Noura, the rent of SAR 1,500 for A-101 has been due since 1 Mar 2026. Thank you.'
	);
});

test('the reminder is written in Arabic when the application shows Arabic', async () => {
	setLocale('ar');
	renderHost();

	contractHost.run('contract.remind', OWING);

	await waitFor(() => expect(hooks.opened).toHaveLength(1));

	const text = textOf(hooks.opened[0]) ?? '';

	expect(text.startsWith('مرحبًا Noura،')).toBe(true);
	expect(text).toContain('1,500 ريال');
});

test('the reminder is not run on a contract in no rank', () => {
	renderHost();

	expect(contractHost.run('contract.remind', { ...OWING, rank: undefined })).toBe(false);
	expect(hooks.reminder).not.toHaveBeenCalled();
});

test('a landing row in a money rank or due soon offers the reminder as a renewals row offers renew', async () => {
	const english = i18nObject('en');
	const entry = {
		id: 'contract-1',
		govId: '4471',
		status: 'active' as const,
		tenantName: 'Noura',
		tenantPhone: '+966551234567',
		outstandingAmount: 1500,
		contractEnd: Date.UTC(2026, 11, 31),
		isEndingSoon: false
	};
	const sectionFor = (rank: 'owing' | 'due-soon' | 'ending-soon') => ({
		summary: { rank, contractCount: 1, totalAmount: 1500 },
		entries: [
			{
				...entry,
				rank,
				...(rank === 'due-soon' ? { comingDue: { due: Date.UTC(2026, 2, 1), amount: 1500 } } : {})
			}
		],
		hiddenCount: 0
	});
	const wrap = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

	for (const rank of ['owing', 'due-soon'] as const) {
		const { unmount } = render(Section, { section: sectionFor(rank) }, wrap);

		expect(screen.queryByRole('button', { name: english.common.actions.renew() })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: english.common.actions.remind() }));

		expect(contractHostState.asked).toEqual({ actId: 'contract.remind', contractId: 'contract-1' });
		contractHostState.asked = null;
		unmount();
	}

	render(Section, { section: sectionFor('ending-soon') }, wrap);

	expect(screen.queryByRole('button', { name: english.common.actions.remind() })).toBeNull();
	expect(screen.getByRole('button', { name: english.common.actions.renew() })).toBeTruthy();
});
