import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { HeldByVersion, OrganizationSession } from '$lib/organization/host';
import {
	fakeOrganizationSession,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing';
import DirectoryImportDialog from '$lib/transfer/component/directory-import-dialog.svelte';
import WorkspaceImportDialog from '$lib/transfer/component/import-dialog.svelte';
import WorkspacePermissions from '$lib/workspace/component/permissions.svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { IMPORT_FLAGS, memberPermissions } from '$lib/permission';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut } from '#tests/permission.ts';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';

/**
 * WHERE THE READER STANDS, AND WHAT AN IMPORT ASKS OF IT
 *
 * Effort 838, requirement 10 and criterion 10. The frame holds what the reader may do in the
 * workspace open, read from the session and the open workspace the way the tRPC context reads
 * them, so a read-only grant folds here as it folds there. An import writes every kind, so both
 * import dialogs ask for every kind's create, as the procedure does, and a reader lacking one is
 * told which and has nothing read. *The workspace's import control was read here too until it
 * moved onto each workspace's card (effort 846, requirement 15), where
 * `organization/workspace/tests/directory.svelte.test.ts` reads it, by the reader's standing in
 * that workspace.*
 *
 * **The reads and the shell are the mock**: the session, the machine's sync record, and the file
 * dialog, which is watched so a refused import is seen to ask for no file.
 */

const { reads, shell } = vi.hoisted(() => ({
	reads: {
		session: null as OrganizationSession | null,
		openWorkspace: 'north' as string | null,
		heldByVersion: [] as HeldByVersion[]
	},
	shell: { openFile: vi.fn(), refused: [] as string[] }
}));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session
				? { session: reads.session, heldByVersion: reads.heldByVersion }
				: undefined;
		}
	})
}));

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	useFetchRemoteSyncState: () => ({
		get data() {
			return fakeSyncState({ workspace: fakeWorkspace({ remoteId: reads.openWorkspace }) });
		}
	})
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: { dialog: { openFile: shell.openFile, saveFile: vi.fn() } }
}));

vi.mock('$lib/notification', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/notification')>()),
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
	reads.heldByVersion = [];
	shell.openFile.mockReset();
	shell.refused.length = 0;
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const providers = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

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
		accessLevel: 'full-access',
		locked: false,
		readOnlyByVersion: false
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

// effort 857, requirement 6 (ticket 05): where the shell says a newer rentable upgraded the
// workspace open past what this one writes, the standing says so, and every write is refused for
// the version on a full grant, while viewing goes on. A verdict on another workspace holds nothing.
test('a workspace upgraded past this version is held read-only for the version', () => {
	reads.session = everyFlagOnTwoWorkspaces();
	reads.heldByVersion = [{ target: { workspace: 'north' }, standing: 'readOnly', reason: '' }];

	const { unmount } = render(WorkspacePermissions);

	expect(memberPermissions.standing?.readOnlyByVersion).toBe(true);
	expect(memberPermissions.views('payment')).toBe(true);
	expect(memberPermissions.refusal('createPayment', i18nObject('en'))).toBe(
		en.common.refusals.host.workspaceReadOnlyByVersion
	);
	expect(memberPermissions.refusal('viewPayment', i18nObject('en'))).toBeUndefined();

	reads.heldByVersion = [{ target: { workspace: 'south' }, standing: 'readOnly', reason: '' }];
	unmount();
	render(WorkspacePermissions);

	expect(memberPermissions.standing?.readOnlyByVersion).toBe(false);
	expect(memberPermissions.refusal('createPayment', i18nObject('en'))).toBeUndefined();
});

// effort 851, requirement 32: a locked session is held as the view flags alone, marked locked, so
// every write is refused for the lock and viewing goes on; once the session reads unlocked, what
// the role carries is held again.
test('a locked session is held as the view flags alone, and as the role once unlocked', () => {
	reads.session = { ...everyFlagOnTwoWorkspaces(), locked: true };

	const { unmount } = render(WorkspacePermissions);

	expect(memberPermissions.standing).toEqual({
		permissions: maskOf('viewComplex', 'viewUnit', 'viewTenant', 'viewContract', 'viewPayment'),
		accessLevel: 'full-access',
		locked: true,
		readOnlyByVersion: false
	});
	expect(memberPermissions.views('payment')).toBe(true);
	expect(memberPermissions.refusal('createPayment', i18nObject('en'))).toBe(
		en.common.permission.locked
	);

	reads.session = everyFlagOnTwoWorkspaces();
	unmount();
	render(WorkspacePermissions);

	expect(memberPermissions.standing?.locked).toBe(false);
	expect(memberPermissions.refusal('createPayment', i18nObject('en'))).toBeUndefined();
});

test('nothing is held before the session has arrived', () => {
	render(WorkspacePermissions);

	expect(memberPermissions.standing).toBeNull();
});

test('both import dialogs refuse before a file is chosen, naming the create the reader lacks', async () => {
	holdEveryFlagBut('createUnit');

	const directory = render(
		DirectoryImportDialog,
		{ title: 'import tenants', concept: 'tenants', onConfirm: async () => {} },
		providers
	);

	await directory.component.choose();

	// the workspace's dialog is handed the refusal by whoever opens it, read off the reader's
	// standing in the workspace it reads into: here the one open.
	const workspace = render(
		WorkspaceImportDialog,
		{
			workspace: { id: 'north', name: 'north' },
			refusal: memberPermissions.refusalOfEvery(IMPORT_FLAGS, i18nObject('en')),
			onConfirm: async () => {}
		},
		providers
	);

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
