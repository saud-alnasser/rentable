import { render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

// the sheets a workspace file is read through are bound as the application binds them.
import '$lib/app/transfer';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import DirectoryImportDialog from '$lib/transfer/component/directory-import-dialog.svelte';
import ImportDialog from '$lib/transfer/component/import-dialog.svelte';
import { emptyTransfer, type WorkspacePlan } from '$lib/transfer';
import Providers from '#tests/providers.svelte';

/**
 * AN IMPORT NAMES EVERY COLLISION IT FOUND
 *
 * Effort 854, ticket 37: a file whose contract rows take one unit twice over, rows 2 and 3 in the
 * first half of the year and rows 4 and 5 in the second, is refused with two collisions, both
 * naming that unit. Each import dialog lists both, rather than keying the list on the unit and
 * throwing on the second.
 *
 * **What reaches Rust is stood in for** at `tauri` and the transfer host, **the plan is stood in
 * for** at `planWorkspaceImport`, since what the planner finds is `transfer.test.ts`'s, and **what
 * the workspace holds** at the caller.
 */

const UNIT = 'Al Nakheel / A1';

const plan: WorkspacePlan = {
	sheets: [
		{
			concept: 'contracts',
			present: true,
			create: 4,
			rejected: [],
			collisions: [
				{ rows: [2, 3], identity: UNIT },
				{ rows: [4, 5], identity: UNIT }
			],
			missingColumns: [],
			unreadable: false
		}
	],
	unresolved: [],
	refusedWhole: false,
	transfer: emptyTransfer()
};

vi.mock('$lib/platform/tauri', () => ({
	tauri: { dialog: { openFile: async () => 'C:/files/contracts.xlsx' } }
}));

vi.mock('$lib/api/caller', () => ({
	default: { transfer: { held: async () => ({}) } }
}));

vi.mock('$lib/permission', async (original) => ({
	...(await original<Record<string, unknown>>()),
	memberPermissions: { refusalOfEvery: () => undefined }
}));

vi.mock('$lib/transfer', async (original) => {
	const actual = await original<Record<string, unknown>>();

	return {
		...actual,
		transferHost: { import: { readBook: async () => [] } },
		planWorkspaceImport: () => plan
	};
});

loadLocale('en');
setLocale('en');

const english = i18nObject('en');
const wrap = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

test('the workspace import lists both collisions on one unit', async () => {
	const { component } = render(
		ImportDialog,
		{
			workspace: { id: 'workspace-1', name: 'Riyadh' },
			refusal: undefined,
			onConfirm: async () => {}
		},
		wrap
	);

	await component.choose();

	for (const rows of ['2, 3', '4, 5']) {
		expect(
			await screen.findByText(
				english.common.import.sheetCollision({
					sheet: english.common.nav.contracts(),
					rows,
					identity: UNIT
				})
			)
		).toBeTruthy();
	}
});

test('a directory import lists both collisions on one unit', async () => {
	const { component } = render(
		DirectoryImportDialog,
		{ title: 'Import contracts', concept: 'contracts', onConfirm: async () => {} },
		wrap
	);

	await component.choose();

	for (const rows of ['2, 3', '4, 5']) {
		expect(
			await screen.findByText(english.common.import.collision({ rows, identity: UNIT }))
		).toBeTruthy();
	}
});
