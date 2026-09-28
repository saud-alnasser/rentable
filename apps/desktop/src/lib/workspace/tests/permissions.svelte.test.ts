import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OrganizationSession } from '$lib/platform/host';
import {
	fakeOrganizationSession,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing';
import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
import WorkspaceImportDialog from '$lib/workspace/component/import-dialog.svelte';
import WorkspacePermissions from '$lib/workspace/component/permissions.svelte';
import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';
import { memberPermissions } from '$lib/workspace/permission';
import QueryProviders from '#tests/query-providers.svelte';
import { describedBy, forgetReader, holdEveryFlagBut, holdReadOnly } from '#tests/permission.ts';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';

/**
 * WHERE THE READER STANDS, AND WHAT AN IMPORT ASKS OF IT
 *
 * Effort 838, requirement 10 and criterion 10. The frame holds what the reader may do in the
 * workspace open, read from the session and the open workspace the way the tRPC context reads
 * them, so a read-only grant folds here as it folds there. An import writes every kind, so both
 * import dialogs and the workspace's import control ask for every kind's create, as the procedure
 * does, and a reader lacking one is told which and has nothing read.
 *
 * **The reads and the shell are the mock**: the session, the machine's sync record, and the file
 * dialog, which is watched so a refused import is seen to ask for no file.
 */

const { reads, shell } = vi.hoisted(() => ({
	reads: {
		session: null as OrganizationSession | null,
		openWorkspace: 'north' as string | null
	},
	shell: { openFile: vi.fn(), refused: [] as string[] }
}));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session ? { session: reads.session } : undefined;
		}
	})
}));

vi.mock('$lib/settings/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/settings/query')>()),
	useFetchRemoteSyncState: () => ({
		get data() {
			return fakeSyncState({ workspace: fakeWorkspace({ remoteId: reads.openWorkspace }) });
		}
	})
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: { dialog: { openFile: shell.openFile, saveFile: vi.fn() } }
}));

vi.mock('$lib/error/toast', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/error/toast')>()),
	showErrorSentence: (sentence: string) => shell.refused.push(sentence)
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	reads.session = null;
	reads.openWorkspace = 'north';
	shell.openFile.mockReset();
	shell.refused.length = 0;
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

/** a member holding every flag, with a full grant on one workspace and a read-only one on another. */
const everyFlagOnTwoWorkspaces = () =>
	fakeOrganizationSession({
		permissions: maskOf(...EVERY_FLAG),
		workspaces: [
			fakeOrganizationWorkspace({ id: 'north', accessLevel: 'full-access' }),
			fakeOrganizationWorkspace({ id: 'south', accessLevel: 'read-only' })
		]
	});

test('the standing held is the session folded for the workspace open, and goes when the frame does', () => {
	reads.session = everyFlagOnTwoWorkspaces();

	const { unmount } = render(WorkspacePermissions);

	expect(memberPermissions.standing).toEqual({
		permissions: maskOf(...EVERY_FLAG),
		accessLevel: 'full-access'
	});
	expect(memberPermissions.views('tenant')).toBe(true);

	unmount();

	expect(memberPermissions.standing).toBeNull();
});

test('in a workspace the reader holds a read-only grant on, every write is refused for the grant', () => {
	reads.session = everyFlagOnTwoWorkspaces();
	reads.openWorkspace = 'south';

	render(WorkspacePermissions);

	expect(memberPermissions.standing?.accessLevel).toBe('read-only');
	expect(memberPermissions.views('payment')).toBe(true);
});

test('nothing is held before the session has arrived', () => {
	render(WorkspacePermissions);

	expect(memberPermissions.standing).toBeNull();
});

test("the workspace's import is refused, naming the create the reader lacks, and asks for no file", async () => {
	holdEveryFlagBut('createContract');
	render(WorkspaceTransfer, {}, providers);

	const control = [...document.querySelectorAll<HTMLElement>('[data-unavailable]')].find((one) =>
		one.textContent?.trim().startsWith(en.common.actions.import)
	);

	expect(control?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(control)).toBe(en.common.permission.missing.createContract);

	await fireEvent.click(control!);

	expect(shell.openFile).not.toHaveBeenCalled();
});

test("on a read-only grant the workspace's import is refused for the grant", () => {
	holdReadOnly();
	render(WorkspaceTransfer, {}, providers);

	const control = document.querySelector('[data-unavailable]');

	expect(describedBy(control)).toBe(en.common.permission.readOnly);
});

test('both import dialogs refuse before a file is chosen, naming the create the reader lacks', async () => {
	holdEveryFlagBut('createUnit');

	const directory = render(
		DirectoryImportDialog,
		{ title: 'import tenants', concept: 'tenants', onConfirm: async () => {} },
		providers
	);

	await directory.component.choose();

	const workspace = render(WorkspaceImportDialog, { onConfirm: async () => {} }, providers);

	await workspace.component.choose();

	expect(shell.refused).toEqual([
		en.common.permission.missing.createUnit,
		en.common.permission.missing.createUnit
	]);
	expect(shell.openFile).not.toHaveBeenCalled();
});

test('a reader holding every create reaches the file dialog', async () => {
	holdEveryFlagBut();
	shell.openFile.mockResolvedValue(null);

	const directory = render(
		DirectoryImportDialog,
		{ title: 'import tenants', concept: 'tenants', onConfirm: async () => {} },
		providers
	);

	await directory.component.choose();

	expect(shell.refused).toEqual([]);
	expect(shell.openFile).toHaveBeenCalledOnce();
});
