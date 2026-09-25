import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';
import { EXPORT_FLAGS } from '$lib/workspace/permission';
import QueryProviders from '#tests/query-providers.svelte';
import { forgetReader, holdEveryFlagBut, refusedControl } from '#tests/permission.ts';

/**
 * A WORKSPACE'S EXPORT, FOR A READER WHO MAY NOT VIEW EVERY KIND
 *
 * Effort 838, requirement 10 and criterion 10: the file holds every kind of record, so
 * `workspace.get` asks for every view flag, and the export control is refused, naming the view
 * flag the reader lacks, unless they hold all five. A refused export asks for no file and reads
 * nothing.
 *
 * **What reaches Rust is stood in for** at `tauri`, and **the workspace read** at the caller.
 */

const hooks = vi.hoisted(() => ({ saveFile: vi.fn(), get: vi.fn() }));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		dialog: { saveFile: hooks.saveFile },
		export: { writeWorkbook: vi.fn() },
		opener: { revealItemInDir: vi.fn() }
	}
}));

vi.mock('$lib/api/caller', () => ({ default: { workspace: { get: hooks.get } } }));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	hooks.saveFile.mockResolvedValue(null);
});

afterEach(() => {
	vi.clearAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const drawn = () =>
	render(
		WorkspaceTransfer,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

test.each(EXPORT_FLAGS)('without %s, the export is refused, naming the flag', async (flag) => {
	holdEveryFlagBut(flag);
	drawn();

	expect(refusedControl(en.common.actions.export)).toMatchObject({
		reason: en.common.permission.missing[flag],
		ariaDisabled: 'true'
	});

	await fireEvent.click(screenExport()!);

	expect(hooks.saveFile).not.toHaveBeenCalled();
	expect(hooks.get).not.toHaveBeenCalled();
});

test('a reader holding every view flag is offered the export', async () => {
	holdEveryFlagBut();
	drawn();

	expect(refusedControl(en.common.actions.export)).toBeUndefined();

	await fireEvent.click(screenExport()!);

	expect(hooks.saveFile).toHaveBeenCalledOnce();
});

/** the export control, by the word it carries. */
function screenExport() {
	return [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
		button.textContent?.trim().toLowerCase().startsWith(en.common.actions.export.toLowerCase())
	);
}
