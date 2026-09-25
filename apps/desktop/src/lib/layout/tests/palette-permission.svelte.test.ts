import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { RecordFlag } from '$lib/workspace/permission';
import {
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	openPalette,
	paletteRow
} from '#tests/permission.ts';

/**
 * THE COMMAND MENU, FOR A READER WHO MAY NOT SEE OR DO EVERYTHING
 *
 * Effort 838, requirement 10 and criterion 10: a kind the reader may not view is not a place the
 * menu goes to and is not searched, and a create the reader lacks the flag for is not offered.
 * `layout/navigation.ts`, `layout/record-search.ts` and `layout/create.ts` are what decide it; this
 * reads it off the menu the frame draws.
 *
 * **The searches are the mock**: each records the term it was handed, so what is asserted is the
 * question the search would have been asked.
 */

const { asked, recording } = vi.hoisted(() => {
	const asked: Record<string, () => string> = {};

	return {
		asked,
		/** a concept's search, recording the term it is handed and finding nothing. */
		recording: (concept: string) => (term: () => string) => {
			asked[concept] = term;

			return { data: [] };
		}
	};
});

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useSearchTenants: recording('tenant')
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useSearchComplexes: recording('complex'),
	useSearchUnits: recording('unit')
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useSearchContracts: recording('contract')
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useSearchPayments: recording('payment')
}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// the command list brings its first row into view as it opens, which jsdom cannot do.
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

/** the place the menu offers to go to at an address, or nothing where it offers none. */
const place = (address: string) =>
	document.querySelector(`[data-slot=command-item][href$="${address}"]`);

/** type into the menu's field, as the reader does. */
const type = async (term: string) =>
	fireEvent.input(document.querySelector<HTMLInputElement>('[data-slot=command-input]')!, {
		target: { value: term }
	});

const VIEWS: [RecordFlag, string, string][] = [
	['viewTenant', 'tenant', '/tenants'],
	['viewComplex', 'complex', '/complexes'],
	['viewContract', 'contract', '/contracts']
];

for (const [flag, concept, address] of VIEWS) {
	test(`without ${flag}, the menu does not go to ${address}, and every other place stays`, async () => {
		holdEveryFlagBut(flag);
		await openPalette();

		expect(place(address)).toBeNull();

		for (const [, , other] of VIEWS.filter(([, kept]) => kept !== concept)) {
			expect(place(other), other).not.toBeNull();
		}
	});
}

for (const concept of ['tenant', 'complex', 'unit', 'contract', 'payment']) {
	test(`a reader who may not view a ${concept} does not search for one`, async () => {
		const flag = `view${concept[0].toUpperCase()}${concept.slice(1)}` as RecordFlag;

		holdEveryFlagBut(flag);
		await openPalette();
		await type('noura');

		expect(asked[concept]?.(), `the ${concept} search`).toBe('');

		for (const other of Object.keys(asked).filter((searched) => searched !== concept)) {
			expect(asked[other](), `the ${other} search`).toBe('noura');
		}
	});
}

test('a create the reader lacks the flag for is not offered, and the others are', async () => {
	holdEveryFlagBut('createTenant', 'createPayment');
	await openPalette();

	expect(paletteRow('create.payment')).toBeNull();
	expect(paletteRow('create.unit')).not.toBeNull();
	// the three made in their directory are links rather than rows that ask.
	expect(place('/tenants?create')).toBeNull();
	expect(place('/complexes?create')).not.toBeNull();
});

test('on a read-only grant the menu offers nothing to create, and still goes everywhere', async () => {
	holdReadOnly();
	await openPalette();

	expect(paletteRow('create.unit')).toBeNull();
	expect(paletteRow('create.payment')).toBeNull();
	expect(place('/complexes?create')).toBeNull();

	for (const [, , address] of VIEWS) {
		expect(place(address), address).not.toBeNull();
	}
});
