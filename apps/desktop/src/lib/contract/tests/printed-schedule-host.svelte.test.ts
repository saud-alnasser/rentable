import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { ContractActRecord } from '$lib/contract/acts';
import ContractHost from '$lib/contract/component/host.svelte';
import { contractHost } from '$lib/contract/host.svelte';
import QueryProviders from '#tests/query-providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * A CONTRACT'S SCHEDULE ON PAPER, FOR A READER WHO MAY NOT VIEW EVERY KIND
 *
 * Effort 838, requirement 10 and criterion 10: the printed schedule carries the contract's tenant
 * and its units only for a reader who may view them, and is read without them otherwise: the
 * interface does not ask for what it would then leave off the page. The complex holding each unit
 * is left out by the read itself (`contract.units.getMany`), which the router test covers.
 *
 * **What reaches Rust is stood in for** at `tauri`, and **the reads** at the caller, since what
 * each states is its router's.
 */

const reads = vi.hoisted(() => ({
	schedule: vi.fn(),
	units: vi.fn(),
	tenant: vi.fn(),
	mark: vi.fn()
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		organization: {
			getState: async () => ({ session: { organizationName: 'Al Nakheel Estates' } })
		},
		print: { page: vi.fn() },
		dialog: { saveFile: vi.fn() },
		opener: { openUrl: vi.fn() }
	}
}));

vi.mock('$lib/api/caller', () => ({
	default: {
		contract: { schedule: reads.schedule, units: { getMany: reads.units } },
		tenant: { get: reads.tenant },
		app: { organization: { mark: { get: reads.mark } } }
	}
}));

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/contracts') } }));

const CONTRACT: ContractActRecord = {
	id: 'contract-1',
	govId: '20471133',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '12m',
	cost: 12000,
	paidAmount: 0,
	expectedAmount: 12000,
	tenantId: 'tenant-1'
};

beforeEach(() => {
	layOutLists();
	loadLocale('en');
	setLocale('en');

	reads.schedule.mockResolvedValue([]);
	reads.units.mockResolvedValue([{ id: 'unit-1', name: 'A-12', complexName: 'Al Nakheel' }]);
	reads.tenant.mockResolvedValue({ id: 'tenant-1', name: 'Noura', phone: '+966500000000' });
	reads.mark.mockResolvedValue(null);
});

afterEach(() => {
	vi.clearAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const page = () =>
	document.querySelector<HTMLElement>('[data-print-preview] [data-printed-schedule]');

const previewed = async () => {
	render(
		ContractHost,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

	expect(contractHost.run('contract.print', CONTRACT)).toBe(true);

	await waitFor(() => expect(page()).not.toBeNull());

	return page()!;
};

const labels = (element: HTMLElement) =>
	[...element.querySelectorAll('dt')].map((term) => term.textContent?.trim());

test('the schedule a reader holding every flag prints names the tenant and the units', async () => {
	holdEveryFlagBut();

	const printed = await previewed();

	expect(printed.querySelector('[data-printed-tenant]')?.textContent).toContain('Noura');
	expect(printed.querySelector('[data-printed-units]')?.textContent).toContain('A-12');
	expect(reads.tenant).toHaveBeenCalled();
	expect(reads.units).toHaveBeenCalled();
});

test('without viewing tenants, the schedule is printed with no tenant, and none is read', async () => {
	holdEveryFlagBut('viewTenant');

	const printed = await previewed();

	expect(printed.querySelector('[data-printed-tenant]')).toBeNull();
	expect(labels(printed)).not.toContain(en.common.labels.tenant);
	expect(printed.textContent).not.toContain('Noura');
	expect(reads.tenant).not.toHaveBeenCalled();
	// the units are still the reader's to see.
	expect(printed.querySelector('[data-printed-units]')?.textContent).toContain('A-12');
});

test('without viewing units, the schedule is printed with no units, and none are read', async () => {
	holdEveryFlagBut('viewUnit');

	const printed = await previewed();

	expect(printed.querySelector('[data-printed-units]')).toBeNull();
	expect(labels(printed)).not.toContain(en.common.labels.units);
	expect(reads.units).not.toHaveBeenCalled();
	expect(printed.querySelector('[data-printed-tenant]')?.textContent).toContain('Noura');
});
