import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { layOutLists } from '#tests/permission.ts';
import Harness from './rename-harness.svelte';

/**
 * A RENAMED WORKSPACE'S CARD SAYS ITS NEW NAME AT ONCE
 *
 * The human's report on effort 851: a workspace renamed from the workspaces section kept its old
 * name on its card until the reader went to another tab and came back. The card reads the name off
 * the workspaces the session lists, which is the organization's state, and the rename refreshed the
 * replica's state alone, so nothing read the organization's again until the section was drawn
 * again. A rename now refreshes what every organization write refreshes (`organizationChanged`).
 *
 * **Nothing between the form and the card is stood in for**: the section's own queries, the form's
 * real mutation and the one query client both sit under. What is stood in for is the shell at
 * the far side of the caller and of the organization's Tauri adapter, which answers with the name
 * the rename stored once it has run, as Rust does.
 */

const shell = vi.hoisted(() => ({ name: 'North Properties', renames: [] as string[] }));

vi.mock('$lib/organization/tauri', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/organization/tauri')>();
	const { fakeOrganizationState, fakeOrganizationSession, fakeOrganizationWorkspace } =
		await import('$lib/organization/tests/testing');

	return {
		tauri: {
			...original.tauri,
			getState: async () =>
				fakeOrganizationState({
					session: fakeOrganizationSession({
						workspaces: [fakeOrganizationWorkspace({ name: shell.name })]
					})
				})
		}
	};
});

vi.mock('$lib/api/caller', async () => {
	const { fakeSyncState, fakeWorkspace } = await import('$lib/sync/tests/testing');
	const { fakeSettings } = await import('$lib/settings/tests/testing');
	const syncState = () =>
		fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north', name: shell.name }) });

	return {
		default: {
			sync: {
				getState: async () => syncState(),
				rename: async ({ name }: { name: string }) => {
					shell.renames.push(name);
					shell.name = name;

					return syncState();
				}
			},
			organization: { member: { list: async () => [], standings: async () => [] } },
			settings: { get: async () => ({ ...fakeSettings(), earlierRecordsSettled: true }) }
		},
		forgetContext: () => {}
	};
});

vi.mock('$lib/workspace/tauri', () => ({
	tauri: { earlier: { find: async () => null, read: vi.fn() } }
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/settings?section=workspaces') }
}));

beforeEach(() => {
	// the tiles are laid in as many columns as the directory's width holds, which it measures.
	layOutLists();
	shell.name = 'North Properties';
	shell.renames = [];
	loadLocale('en');
	setLocale('en');
});

const cardName = () =>
	document.querySelector<HTMLElement>('[data-workspace-name]')?.textContent?.trim();
const field = () => document.querySelector<HTMLInputElement>('[data-slot=form-surface] input');
const surface = () => document.querySelector<HTMLFormElement>('[data-slot=form-surface] form');

test('the card names the workspace by its new name the moment the rename resolves, with no tab switch', async () => {
	const closed = vi.fn();

	render(Harness, {
		strings,
		direction: 'ltr',
		workspace: { name: 'North Properties' },
		onOpenChange: closed
	});

	await waitFor(() => expect(cardName()).toBe('North Properties'));
	await waitFor(() => expect(field()?.value).toBe('North Properties'));

	await fireEvent.input(field()!, { target: { value: 'South Properties' } });
	await fireEvent.submit(surface()!);

	// the form closes once the mutation has resolved, which is after everything it refreshes has
	// been read again: from here the card has nothing left to wait for.
	await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
	await tick();

	expect(shell.renames).toEqual(['South Properties']);
	expect(cardName()).toBe('South Properties');
});
