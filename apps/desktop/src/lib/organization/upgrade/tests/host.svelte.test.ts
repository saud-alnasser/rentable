import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OrganizationSession, UpgradePreview, UpgradeTarget } from '$lib/organization/host';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import UpgradeHost from '$lib/organization/upgrade/component/host.svelte';
import { closeUpgrade, openUpgrade, upgradeSheet } from '$lib/organization/upgrade/sheet.svelte';
import { BUILT_IN } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * THE UPGRADE SHEET, OPENED AND ANSWERED
 *
 * Ticket 08 of [[efforts/857-updating-never-locks-a-member-out/spec]], criterion 3: the sheet is
 * mounted once and opened on a target; it reads what that upgrade would do, not yet closes it with
 * nothing run, and upgrade now runs it through the run's mutation (whose outcome
 * `./run.test.ts` reads), closing once it has landed and staying open where it was refused. A
 * step needing the owner's key, met by anybody else, refuses upgrade now with its reason before
 * anything is asked.
 *
 * **What reaches the shell is stood in for**: the preview and the run, held in runes so a test
 * says what the shell answers and reads what it was asked.
 */

const reads: {
	session: OrganizationSession | null;
	preview: UpgradePreview | undefined;
	previewError: Error | null;
	runs: { target: UpgradeTarget; name: string }[];
	refuse: boolean;
} = $state({
	session: null,
	preview: undefined,
	previewError: null,
	runs: [],
	refuse: false
});

/** every target the preview was read for, kept out of the runes: reading is not a change. */
let asked: (UpgradeTarget | null)[] = [];

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session ? { session: reads.session } : undefined;
		}
	})
}));

vi.mock('$lib/organization/upgrade/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/upgrade/query')>()),
	useFetchUpgradePreview: (target: () => UpgradeTarget | null) => ({
		get data() {
			asked.push(target());

			return target() ? reads.preview : undefined;
		},
		get error() {
			return target() ? reads.previewError : null;
		}
	}),
	useRunUpgrade: () => ({
		get isPending() {
			return false;
		},
		mutateAsync: async (variables: { target: UpgradeTarget; name: string }) => {
			reads.runs.push(variables);

			if (reads.refuse) throw new Error('refused');
		}
	})
}));

const PREVIEW: UpgradePreview = {
	steps: [{ describes: 'paymentDirection' }],
	stopped: [],
	readOnly: [{ member: 'sami.staff', name: 'Desk', rentable: '0.20.0', seenAt: Date.now() }],
	unseen: [],
	needsOwner: false
};

const MANAGER = fakeOrganizationSession({
	role: 'manager',
	roleId: 'manager',
	permissions: BUILT_IN.manager.mask
});

beforeEach(() => {
	document.body.innerHTML = '';
	closeUpgrade();
	reads.session = MANAGER;
	reads.preview = PREVIEW;
	reads.previewError = null;
	asked = [];
	reads.runs = [];
	reads.refuse = false;
	loadLocale('en');
	setLocale('en');
});

const host = () =>
	render(UpgradeHost, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

const surface = () => document.querySelector<HTMLElement>('[data-slot=form-surface]');
const notYet = () => surface()!.querySelector<HTMLButtonElement>('[data-upgrade-not-yet]')!;
const form = () => surface()!.querySelector('form')!;

test('nothing is drawn or read until the sheet is opened on a target', () => {
	host();

	expect(surface()).toBeNull();
	expect(asked.every((asked) => asked === null)).toBe(true);
});

test('opened on a workspace, it reads that upgrade and names the workspace', async () => {
	host();
	openUpgrade({ workspace: 'north' }, 'North');
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());
	expect(asked).toContainEqual({ workspace: 'north' });
	expect(surface()!.textContent).toContain('Upgrade North');
	expect(surface()!.querySelector('[data-upgrade-list="readOnly"]')).not.toBeNull();
});

test('not yet closes it and runs nothing', async () => {
	host();
	openUpgrade({ workspace: 'north' }, 'North');
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());
	await fireEvent.click(notYet());

	expect(upgradeSheet.target).toBeNull();
	expect(reads.runs).toEqual([]);
});

test('upgrade now runs it, and closes once it has landed', async () => {
	host();
	openUpgrade({ workspace: 'north' }, 'North');
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());
	await fireEvent.submit(form());

	await waitFor(() => expect(upgradeSheet.target).toBeNull());
	expect(reads.runs).toEqual([{ target: { workspace: 'north' }, name: 'North' }]);
});

test('a refused run leaves the sheet open, its sentence said by the shared handler', async () => {
	reads.refuse = true;
	host();
	openUpgrade('organization');
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());
	await fireEvent.submit(form());

	await waitFor(() => expect(reads.runs.length).toBe(1));
	expect(upgradeSheet.target).toEqual('organization');
});

test("a step needing the owner's key refuses anybody else at upgrade now, with its reason", async () => {
	reads.preview = { ...PREVIEW, needsOwner: true };
	host();
	openUpgrade('organization');
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());

	const now = surface()!.querySelector<HTMLButtonElement>('[data-upgrade-now]')!;

	expect(now.getAttribute('aria-disabled')).toBe('true');
	expect(now.textContent).toContain(en.common.refusals.host.upgradeNeedsOwner);

	await fireEvent.submit(form());
	expect(reads.runs).toEqual([]);

	// the owner runs it.
	document.body.innerHTML = '';
	reads.session = fakeOrganizationSession();
	host();
	flushSync();

	await waitFor(() => expect(surface()).not.toBeNull());
	await fireEvent.submit(form());
	await waitFor(() => expect(reads.runs).toEqual([{ target: 'organization', name: '' }]));
});
