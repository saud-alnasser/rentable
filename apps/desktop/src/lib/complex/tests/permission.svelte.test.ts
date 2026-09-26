import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ComplexDetails from '$lib/complex/component/details.svelte';
import ComplexDirectory from '$lib/complex/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { newId } from '$lib/platform/database/identity';
import QueryProviders from '#tests/query-providers.svelte';
import {
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	layOutLists,
	openPalette,
	paletteRow,
	refusedControl
} from '#tests/permission.ts';

/**
 * A COMPLEX'S ACTS, FOR A READER WHO MAY NOT TAKE THEM ALL
 *
 * Effort 838, requirement 10 and criterion 10: a complex act whose flag the reader lacks is shown
 * refused on the complex's page, naming the flag, and the command menu does not offer it; the
 * complexes directory refuses its create; the units a complex holds are not listed to a reader who
 * may not view units; and on a read-only grant every edit and delete reads as refused for the grant.
 *
 * **The reads are the mock**: the complex, and the lists the page and the directory draw.
 */

const COMPLEX = { id: newId(), name: 'Al Nakheel', location: 'Riyadh' };

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useFetchComplex: () => ({ data: COMPLEX, isLoading: false }),
	useFetchUnits: () => ({ data: [], isLoading: false }),
	useListUnits: () => ({ data: [], isLoading: false, isFetching: false }),
	useListComplexes: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: [], isLoading: false, isFetching: false })
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

const page = () => render(ComplexDetails, { complexId: COMPLEX.id }, providers);

test("the complex's page refuses the acts whose flags the reader lacks, naming each flag", () => {
	holdEveryFlagBut('editComplex', 'deleteComplex');
	page();

	expect(refusedControl(en.common.actions.edit)).toMatchObject({
		reason: en.common.permission.missing.editComplex,
		ariaDisabled: 'true'
	});
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deleteComplex
	);
	expect(refusedControl(en.common.actions.copyDetails)).toBeUndefined();
});

test('the command menu does not offer a complex act whose flag the reader lacks', async () => {
	holdEveryFlagBut('deleteComplex');
	await openPalette();

	expect(paletteRow('complex.delete')).toBeNull();
	expect(paletteRow('complex.edit')).not.toBeNull();
});

test("without viewing units, the complex's units are not on the page", () => {
	holdEveryFlagBut('viewUnit');
	page();

	expect(screen.queryByText(en.complexes.units.emptyTitle)).toBeNull();

	document.body.innerHTML = '';
	holdEveryFlagBut();
	page();

	expect(screen.queryByText(en.complexes.units.emptyTitle)).not.toBeNull();
});

test('the complexes directory refuses its create, naming the flag', () => {
	holdEveryFlagBut('createComplex');
	render(ComplexDirectory, {}, providers);

	expect(refusedControl(en.common.actions.newComplex)?.reason).toBe(
		en.common.permission.missing.createComplex
	);
	expect(document.querySelector('[data-create-control]')?.getAttribute('aria-disabled')).toBe(
		'true'
	);
});

test('on a read-only grant the edit and the delete read as refused for the grant', () => {
	holdReadOnly();
	page();

	expect(refusedControl(en.common.actions.edit)?.reason).toBe(en.common.permission.readOnly);
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(en.common.permission.readOnly);
});
