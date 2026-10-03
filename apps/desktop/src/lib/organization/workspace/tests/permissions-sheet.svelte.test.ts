import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

// composed, as the frame does by importing them (`glyphOf` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import PermissionsSheet from '$lib/organization/workspace/component/permissions-sheet.svelte';
import type { WorkspaceTailoring } from '$lib/organization/access/access';
import { lacking } from '$lib/organization/role/acts';
import { unfold } from '$lib/organization/tests/switches';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { BUILT_IN, permits } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * WHAT ONE MEMBER MAY DO IN ONE WORKSPACE, ON ITS OWN SHEET
 *
 * Ticket 51 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the human's
 * word of 2026-10-03: "the edit permissions is a sheet with the permissions for this workspace only
 * swtiches to edit and it sayss it is an override on the org and role pemirsisons for this
 * workspace". The sheet draws the workspace's record switches and nothing else, says they override
 * the organization's and the role's permissions there, hands what they come to up on its save, and
 * is refused with its reason where the reader may not change them.
 */

const noop = () => {};

const sheet = (overrides: Record<string, unknown> = {}) =>
	render(
		PermissionsSheet,
		{
			open: true,
			onOpenChange: noop,
			username: 'ada',
			workspaceId: 'ws-1',
			workspaceName: 'Riyadh',
			organizationWide: BUILT_IN.member.mask,
			held: { access: 'full-access', pinned: 0, granted: 0 },
			readerPermissions: BUILT_IN.manager.mask,
			isSaving: false,
			onSave: noop,
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const surface = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const toggle = (flag: string) =>
	document.querySelector<HTMLElement>(`[data-switch="${flag}"]`) ?? null;
const save = () => surface().querySelector<HTMLButtonElement>('button[type="submit"]')!;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('it says whose permissions these are and that they override the organization and the role here', () => {
	sheet();

	const t = i18nObject('en');

	expect(surface().textContent).toContain(
		t.organization.workspacePage.permissionsOf({ username: 'ada' })
	);
	expect(surface().textContent).toContain(
		t.organization.workspacePage.permissionsOverride({ workspace: 'Riyadh' })
	);
});

test('it draws the workspace record switches alone, standing open', async () => {
	sheet();

	expect(document.querySelector('[data-holder-permissions]')).not.toBeNull();
	expect(document.querySelectorAll('[data-switches-group]').length).toBeGreaterThan(0);
	// no fold to open first, no owner line, no role, no workspace switches.
	expect(document.querySelector('[data-tailor-fold]')).toBeNull();
	expect(document.querySelector('[data-switches-owner]')).toBeNull();
	expect(document.querySelector('[data-access-row]')).toBeNull();
	expect(document.querySelector('[data-sheet-section="role"]')).toBeNull();

	await unfold('payment');
	expect(toggle('viewPayment')).not.toBeNull();
	// an organization flag is not a workspace's to set.
	expect(toggle('inviteMember')).toBeNull();
});

test('its save hands up what the switches come to, set as what differs here', async () => {
	let saved: WorkspaceTailoring | null = null;

	sheet({ onSave: (next: WorkspaceTailoring) => (saved = next) });

	await unfold('payment');

	const wasOn = toggle('viewPayment')?.getAttribute('aria-checked') === 'true';

	await fireEvent.click(toggle('viewPayment')!);
	await fireEvent.click(save());

	await waitFor(() => expect(saved).not.toBeNull());
	expect(permits(saved!.pinned, 'viewPayment')).toBe(true);
	expect(permits(saved!.granted, 'viewPayment')).toBe(!wasOn);
});

test('where the reader may change nothing, every switch is refused and says why once', async () => {
	const reason = lacking(i18nObject('en'), 'overrideMember');

	sheet({ refusal: reason });

	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(reason);

	await unfold('payment');
	expect(toggle('viewPayment')?.getAttribute('aria-disabled')).toBe('true');
});

test('what the shell refused stands in the sheet', () => {
	sheet({ error: 'refused here' });

	expect(document.querySelector('[data-holder-permissions-error]')?.textContent?.trim()).toBe(
		'refused here'
	);
});
