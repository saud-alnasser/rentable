import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { EarlierRead, ImportTable, Settings } from '$lib/platform/host';
import { fakeSettings } from '$lib/platform/tests/testing';
import EarlierRecords from '$lib/workspace/component/earlier-records.svelte';
import { IMPORT_FLAGS } from '$lib/workspace/permission';
import { emptyHeld } from '$lib/workspace/workspace';
import QueryProviders from '#tests/query-providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists, refusedControl } from '#tests/permission.ts';
import earlierTables from './earlier.json';

/**
 * THE EARLIER RECORDS, OFFERED IN THE WORKSPACE GROUP
 *
 * Effort 838, requirement 18 and criterion 18: where this machine's `app.db` holds the records of
 * 0.12.0 or 0.13.0 and they were neither brought in nor dismissed, the settings area's workspace
 * group offers them. Bringing them in reads them through the shell and opens the workspace import
 * over what it read, the plan before anything is written; it needs the import's flags. Brought in
 * or dismissed, the offer is written to this machine's settings and goes.
 *
 * **What reaches Rust is stood in for** at `tauri`, and **the settings and the workspace** at the
 * caller, where a settings file is kept between calls so a dismissal is read back as a real one.
 */

const tables = earlierTables as ImportTable[];

const hooks = vi.hoisted(() => ({
	find: vi.fn(),
	read: vi.fn(),
	settings: { current: null as unknown as Settings },
	set: vi.fn(),
	held: vi.fn(),
	importWhole: vi.fn()
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		earlier: { find: hooks.find, read: hooks.read },
		diagnostics: { write: vi.fn(async () => {}) }
	}
}));

vi.mock('$lib/api/caller', () => ({
	default: {
		app: {
			settings: {
				get: async () => hooks.settings.current,
				set: hooks.set
			}
		},
		workspace: { held: hooks.held, importWhole: hooks.importWhole }
	}
}));

const READ: EarlierRead = {
	version: '0.13.0',
	path: 'C:/rentable/backups/app/workspace-0.13.0.xlsx',
	tables
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	layOutLists();
	holdEveryFlagBut();
	hooks.settings.current = { ...fakeSettings(), earlierRecordsSettled: false };
	hooks.find.mockResolvedValue({ version: '0.13.0' });
	hooks.read.mockResolvedValue(READ);
	hooks.held.mockResolvedValue(emptyHeld());
	hooks.importWhole.mockResolvedValue(undefined);
	hooks.set.mockImplementation(async (changeset: Partial<Settings>) => {
		hooks.settings.current = { ...hooks.settings.current, ...changeset };

		return hooks.settings.current;
	});
});

afterEach(() => {
	vi.clearAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const drawn = () =>
	render(
		EarlierRecords,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const callout = () => document.querySelector<HTMLElement>('[data-earlier-records]');
const bringIn = () => document.querySelector<HTMLElement>('[data-earlier-bring-in]');
const dismiss = () => document.querySelector<HTMLElement>('[data-earlier-dismiss]');
const dialog = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');

/** let the two reads the offer waits on settle, then find whether it is drawn. */
async function settled() {
	await waitFor(() => expect(hooks.find).toHaveBeenCalled());
	await new Promise((resolve) => setTimeout(resolve, 0));
}

test('records found and not yet settled are offered, naming the version and the kept workbook', async () => {
	drawn();

	await waitFor(() => expect(callout()).not.toBeNull());

	expect(callout()!.dataset.earlierRecords).toBe('0.13.0');
	expect(callout()!.textContent).toContain('0.13.0');
	expect(callout()!.querySelector('[data-earlier-workbook]')?.textContent).toBe(
		'backups/app/workspace-0.13.0.xlsx'
	);
	expect(callout()!.querySelector('[data-earlier-workbook]')?.getAttribute('dir')).toBe('ltr');
	expect(refusedControl(en.earlier.bringIn)).toBeUndefined();
});

test('nothing is offered where app.db holds no earlier records', async () => {
	hooks.find.mockResolvedValue(null);
	drawn();
	await settled();

	expect(callout()).toBeNull();
});

test('nothing is offered where app.db could not be read, and the failure is not raised', async () => {
	hooks.find.mockRejectedValue(new Error('file is not a database'));
	drawn();
	await settled();

	expect(callout()).toBeNull();
});

test('nothing is offered once this machine has settled them', async () => {
	hooks.settings.current = { ...hooks.settings.current, earlierRecordsSettled: true };
	drawn();
	await settled();

	expect(callout()).toBeNull();
});

test.each(IMPORT_FLAGS)(
	'without %s, bringing them in is refused, naming the flag, and nothing is read',
	async (flag) => {
		holdEveryFlagBut(flag);
		drawn();

		await waitFor(() => expect(callout()).not.toBeNull());

		expect(refusedControl(en.earlier.bringIn)).toMatchObject({
			reason: en.common.permission.missing[flag],
			ariaDisabled: 'true'
		});

		await fireEvent.click(bringIn()!);

		expect(hooks.read).not.toHaveBeenCalled();
		expect(dialog()).toBeNull();
	}
);

test('dismissed, the offer is written to this machine and goes, and stays gone', async () => {
	const first = drawn();

	await waitFor(() => expect(callout()).not.toBeNull());
	await fireEvent.click(dismiss()!);

	expect(hooks.set).toHaveBeenCalledWith({ earlierRecordsSettled: true });
	await waitFor(() => expect(callout()).toBeNull());
	expect(hooks.read).not.toHaveBeenCalled();

	// drawn again, as the settings area is on its next visit: the settings file says so.
	first.unmount();
	drawn();
	await settled();

	expect(callout()).toBeNull();
});

test('bringing them in reads them and opens the import over those tables, writing nothing yet', async () => {
	drawn();

	await waitFor(() => expect(callout()).not.toBeNull());
	await fireEvent.click(bringIn()!);

	await waitFor(() => expect(dialog()).not.toBeNull());

	expect(hooks.read).toHaveBeenCalledOnce();
	expect(hooks.held).toHaveBeenCalledOnce();
	// the file the tables are is named under the title, as a chosen file would be.
	expect(dialog()!.textContent).toContain('workspace-0.13.0.xlsx');
	// every sheet of the earlier records, each creating its one record.
	expect(dialog()!.textContent).toContain(en.common.nav.tenants);
	expect(hooks.importWhole).not.toHaveBeenCalled();
	expect(hooks.set).not.toHaveBeenCalled();
	// the kept workbook is now named by where it was written.
	expect(callout()!.querySelector('[data-earlier-workbook]')?.textContent).toBe(READ.path);
});

test('brought in, the records are written and the offer goes', async () => {
	drawn();

	await waitFor(() => expect(callout()).not.toBeNull());
	await fireEvent.click(bringIn()!);
	await waitFor(() => expect(dialog()).not.toBeNull());

	const confirm = [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(
		(button) => button.textContent?.trim() === en.common.actions.import
	);

	await fireEvent.click(confirm!);

	await waitFor(() => expect(hooks.importWhole).toHaveBeenCalledOnce());
	await waitFor(() => expect(hooks.set).toHaveBeenCalledWith({ earlierRecordsSettled: true }));
	await waitFor(() => expect(callout()).toBeNull());
});

test('walking away from the import leaves the offer standing', async () => {
	drawn();

	await waitFor(() => expect(callout()).not.toBeNull());
	await fireEvent.click(bringIn()!);
	await waitFor(() => expect(dialog()).not.toBeNull());

	const cancel = [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(
		(button) => button.textContent?.trim() === en.common.actions.cancel
	);

	await fireEvent.click(cancel!);

	await waitFor(() => expect(dialog()).toBeNull());
	expect(hooks.set).not.toHaveBeenCalled();
	expect(callout()).not.toBeNull();
});
