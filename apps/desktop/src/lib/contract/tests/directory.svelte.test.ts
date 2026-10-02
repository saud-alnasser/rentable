import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// what the other features contribute to the directory, composed and provided as the frame does by
// importing them (`contributionsTo` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import ContractDirectory from '$lib/contract/component/directory.svelte';
import { CONTRACT_TILE_HEIGHT } from '$lib/contract/component/record.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * THE CONTRACTS DIRECTORY, FOR A READER WHO MAY NOT VIEW TENANTS OR PAYMENTS
 *
 * Effort 838, requirement 10 and criterion 10: `contract.getMany` answers a reader who may not view
 * tenants with no tenant's name or phone, and one who may not view payments with no count of them
 * (the router test covers both). The directory draws such a row whole: the card leads with the
 * contract's own reference rather than a tenant, draws no figure where the count stood, and offers
 * no order by the tenant.
 *
 * **The read is the mock**, answering with the row the router answers each reader with.
 */

const CONTRACT = {
	id: 'contract-1',
	govId: '4471',
	status: 'active' as const,
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m' as const,
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	tenantId: 'tenant-1'
};

const { rows } = vi.hoisted(() => ({ rows: { current: [] as object[] } }));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: rows.current, isLoading: false, isFetching: false }),
	usePlanManyContracts: () => ({ data: undefined })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts' }, url: new URL('http://localhost/contracts') }
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	// jsdom lays nothing out, so the list is given a viewport its rows can be drawn into.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
});

afterEach(() => {
	vi.restoreAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const directory = () =>
	render(
		ContractDirectory,
		{},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** the card's link, whose name is what the card leads with. */
const card = () => document.querySelector<HTMLAnchorElement>('a[href$="/contracts/contract-1"]');

/** the card's count of payments, which is drawn as a figure only above zero. */
const paymentCount = () => document.querySelector<HTMLElement>('[data-payment-count]');

const offeredOrders = async () => {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	return [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].map((item) =>
		item.textContent?.trim()
	);
};

test('a row carrying its tenant and its payments leads with the tenant and counts them', async () => {
	holdEveryFlagBut();
	rows.current = [
		{ ...CONTRACT, tenantName: 'Noura', tenantPhone: '+966500000001', paymentCount: 2 }
	];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	expect(card()?.getAttribute('aria-label') ?? card()?.textContent).toContain('Noura');
	expect(document.body.textContent).toContain('4471');
	expect(paymentCount()?.textContent?.trim()).toBe('2');
	expect(await offeredOrders()).toContain(en.common.labels.tenant);
});

test('without viewing tenants or payments, a row leads with its reference, names nobody and counts nothing', async () => {
	holdEveryFlagBut('viewTenant', 'viewPayment');
	rows.current = [CONTRACT];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	const said = document.body.textContent ?? '';

	// led by the contract's own reference, once, and never by a stand-in for the tenant.
	expect(card()?.getAttribute('aria-label') ?? card()?.textContent).toContain('4471');
	expect(said.split('4471')).toHaveLength(2);
	expect(said).not.toContain('Noura');
	expect(said.toLowerCase()).not.toContain(en.common.labels.tenant);
	expect(paymentCount()).toBeNull();
	expect(said).not.toContain(en.common.nav.payments);
	expect(await offeredOrders()).not.toContain(en.common.labels.tenant);
});

// --- The tile (effort 846, requirements 18 and 19, ticket 44) -----------------------------

/** the glyph a lucide icon draws, by its own class past the one every lucide icon carries. */
const glyphOf = (svg: Element | null) =>
	[...(svg?.classList ?? [])]
		.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
		?.slice('lucide-'.length);

/** each field the tile draws, as its glyph, its name, its value and whether it says nothing. */
const fields = () =>
	[...document.querySelectorAll<HTMLElement>('[data-contract-field]')].map((field) => {
		const svg = field.querySelector('svg');
		const value = field.querySelector<HTMLElement>('[data-contract-field-value]');

		expect(field.hasAttribute('data-field')).toBe(true);
		expect(svg?.getAttribute('aria-hidden')).toBe('true');

		return {
			glyph: glyphOf(svg),
			name: field.querySelector('[data-contract-field-name]')?.textContent?.trim(),
			value: value?.textContent?.trim(),
			empty: value?.hasAttribute('data-empty') ?? false
		};
	});

const drawIn = (language: 'en' | 'ar') => {
	loadLocale(language);
	setLocale(language);

	return render(
		ContractDirectory,
		{},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: language === 'ar' ? ('rtl' as const) : ('ltr' as const) }
		}
	);
};

test('a contract is a tile: the tenant and the status with its word lead, then its facts as tinted fields two across', async () => {
	holdEveryFlagBut();
	rows.current = [
		{
			...CONTRACT,
			paidAmount: 1500,
			tenantName: 'Noura',
			tenantPhone: '+966500000001',
			paymentCount: 1,
			unitNames: ['Room 2', 'Room 10']
		}
	];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	const tile = card()!.closest<HTMLElement>('[data-layout="tile"]');
	expect(tile).not.toBeNull();

	// the status reads as its word on a tile, beside its icon.
	const status = tile!.querySelector<HTMLElement>('[data-status-labelled]');
	expect(status?.textContent?.trim()).toBe(en.common.status.active);
	expect(status?.querySelector('svg')).not.toBeNull();

	const grid = tile!.querySelector<HTMLElement>('[data-contract-fields]')!;
	expect(grid.classList).toContain('grid');
	expect(grid.classList).toContain('grid-cols-2');
	// the old fact lines are gone: every fact is a field.
	expect(tile!.querySelectorAll('[data-fact]')).toHaveLength(0);

	expect(fields()).toEqual([
		{
			glyph: 'calendar-range',
			name: en.common.labels.contractPeriod,
			value: expect.stringContaining('2026'),
			empty: false
		},
		{ glyph: 'hash', name: en.common.labels.contractNumber, value: '4471', empty: false },
		{ glyph: 'layout-grid', name: en.common.labels.units, value: 'Room 2, Room 10', empty: false },
		{
			glyph: 'repeat',
			name: 'cost · monthly',
			value: expect.stringContaining('1,500'),
			empty: false
		},
		{ glyph: 'banknote', name: en.common.nav.payments, value: '1', empty: false },
		{
			glyph: 'wallet',
			name: en.contracts.card.paidOfExpected,
			value: expect.stringMatching(/1,500 \/ 18,000/),
			empty: false
		}
	]);

	// the ring stands beside the paid field, with the figures it is drawn from.
	const paid = tile!.querySelector<HTMLElement>('[data-contract-paid]')!;
	expect(paid.querySelector('svg circle')).not.toBeNull();
	expect(paid.querySelector('[data-contract-field]')).not.toBeNull();
});

test('a tile with no payments and no units says none, muted, and draws no zero', async () => {
	holdEveryFlagBut();
	rows.current = [{ ...CONTRACT, tenantName: 'Noura', paymentCount: 0, unitNames: [] }];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	const byName = Object.fromEntries(fields().map((field) => [field.name, field]));

	expect(byName[en.common.nav.payments]).toMatchObject({ value: 'none', empty: true });
	expect(byName[en.common.labels.units]).toMatchObject({ value: 'none', empty: true });
	expect(paymentCount()).toBeNull();
	for (const field of fields()) {
		expect(field.value).not.toBe('0');
	}
});

test('without viewing units or payments, the tile draws neither field', async () => {
	holdEveryFlagBut('viewPayment');
	rows.current = [{ ...CONTRACT, tenantName: 'Noura' }];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	expect(fields().map((field) => field.glyph)).toEqual([
		'calendar-range',
		'hash',
		'repeat',
		'wallet'
	]);
});

test('in Arabic, the fields are named in Arabic, the units joined by its separator, and none is a word', async () => {
	holdEveryFlagBut();
	rows.current = [
		{ ...CONTRACT, tenantName: 'نورة', paymentCount: 0, unitNames: ['Room 2', 'Room 10'] }
	];
	drawIn('ar');

	await waitFor(() => expect(card()).not.toBeNull());

	const said = fields();

	expect(said.map((field) => [field.glyph, field.name])).toEqual([
		['calendar-range', ar.common.labels.contractPeriod],
		['hash', ar.common.labels.contractNumber],
		['layout-grid', ar.common.labels.units],
		['repeat', `التكلفة · ${ar.contracts.intervals.monthly}`],
		['banknote', ar.common.nav.payments],
		['wallet', ar.contracts.card.paidOfExpected]
	]);

	// the locale's separator alone, with no "و" glued to a Latin name, each name isolated.
	const units = document.querySelector<HTMLElement>('[data-contract-units]')!;
	expect(units.textContent?.trim()).toBe('Room 2، Room 10');
	expect(units.querySelectorAll('bdi')).toHaveLength(2);

	expect(said.find((field) => field.glyph === 'banknote')).toMatchObject({
		value: ar.contracts.card.none,
		empty: true
	});
	for (const field of said) {
		expect(field.value).not.toMatch(/^[0٠]$/);
	}
});

// the list lays the tiles at a declared height rather than measuring them, so the figure is the
// count of the tile's lines at their fixed leading: the padding, the heading, the gap to the
// fields, three rows of fields (padding, a name and a value), the gap to the foot, and the paid
// field the ring stands beside.
test('the directory lays its tiles at the declared height, the count of their lines', async () => {
	const field = 8 + 20 + 20 + 8;

	expect(CONTRACT_TILE_HEIGHT).toBe(32 + 32 + 12 + (field + 8 + field + 8 + field) + 12 + field);

	holdEveryFlagBut();
	rows.current = [{ ...CONTRACT, tenantName: 'Noura', paymentCount: 2, unitNames: ['Room 2'] }];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	const tile = card()!.closest<HTMLElement>('[data-layout="tile"]')!;
	expect(tile.classList).toContain('gap-3');

	// every line of every field sets the fixed leading, so the height holds in Arabic.
	for (const line of tile.querySelectorAll(
		'[data-contract-field-name], [data-contract-field-value]'
	)) {
		expect(line.classList).toContain('leading-5');
	}

	// the list's row is the declared height and the gap under it, which it leaves as padding.
	const row = tile.parentElement!.closest<HTMLElement>('[style*="height"]')!;
	expect(Number.parseFloat(row.style.height) - Number.parseFloat(row.style.paddingBottom)).toBe(
		CONTRACT_TILE_HEIGHT
	);
});
