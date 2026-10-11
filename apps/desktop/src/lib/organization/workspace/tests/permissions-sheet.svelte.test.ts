import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

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

/**
 * A changed sheet asks before it closes (requirement 10 of
 * [[efforts/861-the-app-never-shows-something-false/spec]], ticket 08). The sheet says whether a
 * switch moved from what it opened on, and the surface asks on that: driven here through the
 * sheet's own cancel, which reaches the surface's `requestClose`. The question's words are the
 * placeholder contract's, `{discard}` and `{keepEditing}`.
 */
const cancel = () =>
	Array.from(surface().querySelectorAll<HTMLButtonElement>('button[type="button"]')).find(
		(button) => button.textContent?.trim() === i18nObject('en').common.actions.cancel()
	)!;
const question = () => document.querySelector('[data-confirm-dialog]');

test('a turned switch asks before the sheet closes', async () => {
	const onOpenChange = vi.fn();

	sheet({ onOpenChange });

	await unfold('payment');
	await fireEvent.click(toggle('viewPayment')!);
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(question()?.textContent).toContain('{discard}');
	expect(question()?.textContent).toContain('{keepEditing}');
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('an untouched sheet closes at once', async () => {
	const onOpenChange = vi.fn();

	sheet({ onOpenChange });

	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

// a write rather than a view: turning a view off turns its writes off with it, and turning it on
// again turns none of them back, so a view turned and turned back is a change.
test('a switch turned and turned back closes at once', async () => {
	const onOpenChange = vi.fn();

	sheet({ onOpenChange });

	await unfold('payment');
	await fireEvent.click(toggle('deletePayment')!);
	expect(toggle('deletePayment')?.getAttribute('aria-checked')).toBe('true');
	await fireEvent.click(toggle('deletePayment')!);
	expect(toggle('deletePayment')?.getAttribute('aria-checked')).toBe('false');
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});
