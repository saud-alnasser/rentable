import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import UnitDetails from '$lib/complex/component/unit-details.svelte';
import unitDirectory from '$lib/complex/component/unit-directory.svelte?raw';
import * as Cell from '$lib/design/cell/index.ts';
import Providers from '$lib/design/cell/tests/providers.svelte';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

/**
 * A UNIT'S STATUS IS NEVER COLOUR ALONE
 *
 * Ticket 29 of effort 832, from the walk of ticket 27: a unit's status, on its page and on the
 * unit rows of a complex, looked like a blue dot and nothing else. It is drawn the way every status
 * is ([[rules/interface]], *Status presentation*): a glyph with no visible word, whose word is its
 * accessible name and whose word and description open in a tooltip on hover and on focus. What
 * this holds is that a unit's two statuses get the whole of that, and that both surfaces draw the
 * unit's status through the one cell rather than a dot of their own.
 *
 * The page is rendered with its read mocked and its contracts left out. A row cannot be: the
 * directory is virtualised and jsdom lays nothing out, so no row is ever in its window. The row's
 * half is the cell, rendered here as the row renders it, and the directory is read to hold that
 * it does.
 */

const { unit } = vi.hoisted(() => ({
	unit: {
		id: 'unit-1',
		name: 'Room 1',
		complexId: 'complex-1',
		complexName: 'Ebert Neck 1',
		status: 'occupied' as 'occupied' | 'vacant'
	}
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useFetchUnit: () => ({ data: unit, isLoading: false })
}));

// the unit's contracts are a directory of their own, with a query client and a selection of
// their own; none of it is what is asked here.
vi.mock('$lib/complex/component/unit-contracts.svelte', () => ({ default: () => {} }));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	unit.status = 'occupied';

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

/** the one status on screen, found by the word it is named by. */
const statusNamed = (word: string) =>
	screen.getAllByText(word).find((node) => node.classList.contains('sr-only'))?.parentElement;

for (const [status, word, description] of [
	['occupied', 'occupied', /a contract/i],
	['vacant', 'vacant', /no contract/i]
] as const) {
	test(`a unit's page names its status, ${status}, and says what it means on focus`, async () => {
		unit.status = status;

		render(UnitDetails, { unitId: unit.id }, { wrapper: Providers });

		const trigger = statusNamed(word);

		expect(trigger).toBeTruthy();
		// reachable from the keyboard, so the word is not the pointer's alone.
		expect(trigger?.getAttribute('tabindex')).toBe('0');

		await fireEvent.focus(trigger!);

		await waitFor(() => {
			const tooltip = document.querySelector('[data-slot="tooltip-content"]');

			expect(tooltip?.textContent).toContain(word);
			expect(tooltip?.textContent).toMatch(description);
		});
	});

	test(`a unit row's status, ${status}, is named by its word`, () => {
		render(Cell.Status, { status }, { wrapper: Providers });

		const trigger = statusNamed(word);

		expect(trigger?.getAttribute('tabindex')).toBe('0');
		expect(trigger?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});
}

test('the unit rows draw the status through the one status cell', () => {
	expect(unitDirectory).toContain('<Cell.Status status={record.status} />');
});
