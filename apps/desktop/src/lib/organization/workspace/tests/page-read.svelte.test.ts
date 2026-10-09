import { render, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspacePage from '$lib/organization/workspace/component/page.svelte';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import { resetHostAnswers } from '$lib/organization/tests/host-hooks';
import type { OrganizationWorkspace } from '$lib/organization/host';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';
import { layOutLists } from '#tests/permission.ts';

/**
 * A WORKSPACE'S PAGE, WHEN ITS READ FAILS
 *
 * Ticket 04 of effort 861, requirement 1 and criterion 1: the workspace page reads the
 * organization's state, and where that read failed it says the read failed, with *try again*,
 * never that the workspace is not there. *Try again* runs the read again, and a read that then
 * answers draws the workspace.
 *
 * **What reaches Rust is stood in for**: the organization's state at the shell, so the page's own
 * query runs as it does in the window, against a shell that refuses it and then answers. What the
 * page reads besides it (the members, the sync record, the writes) is the host's stand-ins, as the
 * page's own test has them (`./page.svelte.test.ts`).
 */

const host = vi.hoisted(() => ({ getState: vi.fn() }));

vi.mock('$lib/organization/tauri', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/organization/tauri')>();

	return { ...original, tauri: { ...original.tauri, getState: () => host.getState() } };
});

vi.mock('$lib/api/caller', () => ({ default: {} }));

vi.mock('$lib/organization/member/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/member/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/access/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/access/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).syncHooks
}));

const WORKSPACE: OrganizationWorkspace = {
	id: 'ws-1',
	name: 'Riyadh',
	databaseName: 'ws-1',
	databaseHostname: 'ws-1.turso.io',
	schemaVersion: 1,
	accessLevel: 'full-access',
	pinned: 0,
	granted: 0,
	permissions: maskOf(...EVERY_FLAG)
};

const state = () => ({
	session: fakeOrganizationSession({
		memberId: 'owner',
		role: 'owner',
		permissions: maskOf(...EVERY_FLAG),
		workspaces: [WORKSPACE]
	}),
	holdsTursoAuthority: false
});

beforeEach(() => {
	layOutLists();
	resetHostAnswers();
	host.getState.mockReset();
	loadLocale('en');
	setLocale('en');
});

const open = () =>
	render(
		WorkspacePage,
		{ workspaceId: WORKSPACE.id },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const empty = () => document.querySelector<HTMLElement>('[data-empty]');

test('a workspace page whose read failed says so, and never that the workspace is not there', async () => {
	host.getState.mockRejectedValue(new Error('the organization could not be read'));
	open();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(empty()?.textContent).toContain(strings.readFailed);
	expect(document.body.textContent).not.toContain(strings.recordNotFound);
});

test('try again runs the read again, and a read that answers draws the workspace', async () => {
	host.getState.mockRejectedValueOnce(new Error('the organization could not be read'));
	host.getState.mockResolvedValue(state());
	open();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(host.getState).toHaveBeenCalledTimes(1);

	within(empty()!).getByRole('button', { name: strings.tryAgain }).click();

	await waitFor(() => expect(document.querySelector('h1')?.textContent?.trim()).toBe('Riyadh'));

	expect(host.getState).toHaveBeenCalledTimes(2);
	expect(document.querySelector('[data-empty="failed"]')).toBeNull();
});
