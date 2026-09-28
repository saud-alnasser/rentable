import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import UnitDetails from '$lib/complex/unit/component/details.svelte';
import UnitDirectory from '$lib/complex/unit/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { newId } from '$lib/platform/database/identity';
import QueryProviders from '#tests/query-providers.svelte';
import {
	describedBy,
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	layOutLists,
	openPalette,
	paletteRow,
	refusedControl
} from '#tests/permission.ts';

/**
 * A UNIT'S ACTS, FOR A READER WHO MAY NOT TAKE THEM ALL
 *
 * Effort 838, requirement 10 and criterion 10: a unit act whose flag the reader lacks is shown
 * refused on the unit's page, naming the flag, and the command menu does not offer it; a complex's
 * unit directory refuses its create, its import and its action on a selection the same way; the
 * contracts that mention a unit are not shown to a reader who may not view contracts; and on a
 * read-only grant every create, edit and delete reads as refused for the grant.
 *
 * **The reads are the mock**: the unit, and the lists the page and the directory draw.
 */

const UNIT = {
	id: newId(),
	name: 'A1',
	complexId: 'complex-1',
	complexName: 'Al Nakheel',
	status: 'vacant' as const
};

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useFetchUnit: () => ({ data: UNIT, isLoading: false }),
	useListUnits: () => ({
		isLoading: false,
		isFetching: false,
		data: [{ ...UNIT, tenantName: null }]
	}),
	useDeleteManyUnits: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyUnits: () => ({ data: undefined })
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	forgetReader();
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

const page = () => render(UnitDetails, { unitId: UNIT.id }, providers);

const directory = () =>
	render(UnitDirectory, { complexId: UNIT.complexId, complexName: UNIT.complexName }, providers);

test("the unit's page refuses the acts whose flags the reader lacks, naming each flag", () => {
	holdEveryFlagBut('editUnit', 'deleteUnit', 'createContract');
	page();

	expect(refusedControl(en.common.actions.edit)).toMatchObject({
		reason: en.common.permission.missing.editUnit,
		ariaDisabled: 'true'
	});
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deleteUnit
	);
	expect(refusedControl(en.common.actions.newContract)?.reason).toBe(
		en.common.permission.missing.createContract
	);
});

test('the command menu does not offer a unit act whose flag the reader lacks', async () => {
	holdEveryFlagBut('editUnit');
	await openPalette();

	expect(paletteRow('unit.edit')).toBeNull();
	expect(paletteRow('unit.delete')).not.toBeNull();
});

test('without viewing contracts, the contracts that mention the unit are not on its page', () => {
	holdEveryFlagBut('viewContract');
	page();

	expect(screen.queryByText(en.complexes.units.contractsEmptyTitle)).toBeNull();

	document.body.innerHTML = '';
	holdEveryFlagBut();
	page();

	expect(screen.queryByText(en.complexes.units.contractsEmptyTitle)).not.toBeNull();
});

test('the unit directory refuses its create and its import, naming the flag', async () => {
	holdEveryFlagBut('createUnit');
	directory();

	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(create)).toBe(en.common.permission.missing.createUnit);

	// an import writes every kind, so it asks for every kind's create, and names the one lacking.
	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.transferData }));

	const entry = document.querySelector('[data-transfer="import"]');

	expect(entry?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(entry)).toBe(en.common.permission.missing.createUnit);
});

test('the unit directory refuses deleting a selection to a reader who may not delete units', async () => {
	// jsdom lays nothing out, so the list's viewport is given a size the virtualiser can fill.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	holdEveryFlagBut('deleteUnit');
	directory();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-select-control]')!);
	await waitFor(() =>
		expect(
			screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })
		).not.toHaveLength(0)
	);
	await fireEvent.click(screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })[0]);

	await waitFor(() => expect(refusedControl(en.common.actions.delete)).toBeDefined());
	expect(refusedControl(en.common.actions.delete)).toMatchObject({
		reason: en.common.permission.missing.deleteUnit,
		ariaDisabled: 'true'
	});
});

test('on a read-only grant every create, edit and delete on the page reads as refused for the grant', () => {
	holdReadOnly();
	page();

	for (const act of [
		en.common.actions.edit,
		en.common.actions.newContract,
		en.common.actions.delete
	]) {
		expect(refusedControl(act)?.reason, act).toBe(en.common.permission.readOnly);
	}
});
