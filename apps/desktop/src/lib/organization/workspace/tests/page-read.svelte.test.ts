import { render, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspacePage from '$lib/organization/workspace/component/page.svelte';
import { fakeOrganizationMember, fakeOrganizationSession } from '$lib/organization/tests/testing';
import { resetHostAnswers } from '$lib/organization/tests/host-hooks';
import type { OrganizationWorkspace } from '$lib/organization/host';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import en from '$lib/i18n/en';
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
 * Ticket 21 of effort 861: the page reads its members too, and a members read that failed is the
 * page's failure as much as the state's. It never says the workspace is held by nobody, nor offers
 * to put somebody in, from members it could not read; *try again* runs each read that failed.
 *
 * **What reaches Rust is stood in for**: the organization's state at the shell, and the members
 * at the caller the members' query reads through, so the page's own queries run as they do in the
 * window, against reads that refuse and then answer. What the page reads besides them (the
 * standings, the sync record, the writes) is the host's stand-ins, as the page's own test has
 * them (`./page.svelte.test.ts`).
 */

const host = vi.hoisted(() => ({ getState: vi.fn(), members: vi.fn() }));

vi.mock('$lib/organization/tauri', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/organization/tauri')>();

	return { ...original, tauri: { ...original.tauri, getState: () => host.getState() } };
});

vi.mock('$lib/api/caller', () => ({
	default: { organization: { member: { list: () => host.members() } } }
}));

// the members are read through the page's own query, against the caller above; the rest of the
// module is the host's stand-ins.
vi.mock('$lib/organization/member/query', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/organization/member/query')>();

	return {
		...original,
		...(await import('$lib/organization/tests/host-hooks')).hostHooks,
		useFetchMembers: original.useFetchMembers
	};
});

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

/** one member besides the owner, holding the workspace. */
const ADA = fakeOrganizationMember({
	id: 'ada',
	username: 'ada',
	role: 'manager',
	workspaces: [{ id: WORKSPACE.id, access: 'full-access', pinned: 0, granted: 0, permissions: 0 }]
});

beforeEach(() => {
	layOutLists();
	resetHostAnswers();
	host.getState.mockReset();
	host.members.mockReset();
	// the members answer unless a test says otherwise.
	host.members.mockResolvedValue([]);
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

const membersFact = () => document.querySelector<HTMLElement>('[data-entry="members"]');

test('a workspace page whose members read failed says so, and never that nobody holds it', async () => {
	host.getState.mockResolvedValue(state());
	host.members.mockRejectedValue(new Error('the members could not be read'));
	open();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(empty()?.textContent).toContain(strings.readFailed);
	expect(document.body.textContent).not.toContain(
		en.organization.dashboard.workspaceCard.noMembers
	);
	expect(document.body.textContent).not.toContain(en.organization.workspacePage.nobodyHolds);
	expect(document.querySelector('[data-holders-empty]')).toBeNull();
	expect(membersFact()).toBeNull();
});

// a members read still on its way is loading, not a workspace held by nobody.
test('a workspace page whose members are still on their way says nobody holds it nowhere', async () => {
	host.getState.mockResolvedValue(state());
	host.members.mockReturnValue(new Promise(() => {}));
	open();

	await waitFor(() => expect(host.members).toHaveBeenCalled());
	await waitFor(() => expect(host.getState).toHaveBeenCalled());

	expect(document.body.textContent).not.toContain(
		en.organization.dashboard.workspaceCard.noMembers
	);
	expect(document.body.textContent).not.toContain(en.organization.workspacePage.nobodyHolds);
	expect(document.querySelector('[data-holders-empty]')).toBeNull();
});

test('try again runs the members read again, and members that answer are drawn', async () => {
	host.getState.mockResolvedValue(state());
	host.members.mockRejectedValueOnce(new Error('the members could not be read'));
	host.members.mockResolvedValue([ADA]);
	open();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(host.members).toHaveBeenCalledTimes(1);

	within(empty()!).getByRole('button', { name: strings.tryAgain }).click();

	await waitFor(() => expect(document.querySelector('[data-holder="ada"]')).not.toBeNull());

	// only the read that failed ran again: the state's answer stood.
	expect(host.members).toHaveBeenCalledTimes(2);
	expect(host.getState).toHaveBeenCalledTimes(1);
	expect(membersFact()?.textContent).toContain('1');
	expect(document.querySelector('[data-empty="failed"]')).toBeNull();
});

test('try again runs every read that failed, and the page draws once both answer', async () => {
	host.getState.mockRejectedValueOnce(new Error('the organization could not be read'));
	host.getState.mockResolvedValue(state());
	host.members.mockRejectedValueOnce(new Error('the members could not be read'));
	host.members.mockResolvedValue([ADA]);
	open();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));
	await waitFor(() => expect(host.members).toHaveBeenCalledTimes(1));

	within(empty()!).getByRole('button', { name: strings.tryAgain }).click();

	await waitFor(() => expect(document.querySelector('[data-holder="ada"]')).not.toBeNull());

	expect(host.getState).toHaveBeenCalledTimes(2);
	expect(host.members).toHaveBeenCalledTimes(2);
	expect(document.querySelector('h1')?.textContent?.trim()).toBe('Riyadh');
});
