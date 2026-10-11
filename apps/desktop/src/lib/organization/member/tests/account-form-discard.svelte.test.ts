import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// the glyph each kind of record's group wears is its surface's, provided as the surfaces are
// composed, as the frame does by importing them (`glyphOf` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountForm from '$lib/organization/member/component/account-form.svelte';
import { resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import { fakeOrganizationRoles } from '$lib/organization/tests/testing';
import { BUILT_IN } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * THE ACCOUNT FORM, CLOSED BEFORE IT IS SAVED
 *
 * Requirement 10 of effort 861: a form with changes asks before it closes, and one with none
 * closes at once. Of what an account is made with, only the username is a field; the role, the
 * override and the workspaces are held beside it, so the form reports them itself, and a
 * workspace switched on asks as a typed username does.
 */

const workspaces = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		databaseName: 'ws-1',
		databaseHostname: 'ws-1.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access' as const,
		pinned: 0,
		granted: 0,
		permissions: 0
	}
];

beforeEach(() => {
	resetOrganizationDialogs();
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const question = () => document.querySelector('[data-confirm-dialog]');

const cancel = () =>
	screen
		.getAllByRole('button')
		.find((button) => button.textContent?.trim() === en.common.actions.cancel)!;

const inSwitch = (id: string) => document.querySelector<HTMLElement>(`#account-access-${id}`)!;

function open() {
	const onOpenChange = vi.fn();

	render(
		AccountForm,
		{
			open: true,
			onOpenChange,
			workspaces,
			roles: fakeOrganizationRoles(),
			readerRank: BUILT_IN.owner.rank,
			readerPermissions: BUILT_IN.owner.mask,
			isCreating: false,
			onCreate: () => {}
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	return onOpenChange;
}

test('an account nobody has touched closes without asking', async () => {
	const onOpenChange = open();

	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('an account with a username typed asks before closing', async () => {
	const onOpenChange = open();

	await fireEvent.input(document.querySelector<HTMLInputElement>('input[name=username]')!, {
		target: { value: 'noura' }
	});
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('an account with a workspace switched on asks before closing', async () => {
	const onOpenChange = open();

	await fireEvent.click(inSwitch('ws-1'));
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('a workspace switched on and off again leaves nothing to lose', async () => {
	const onOpenChange = open();

	await fireEvent.click(inSwitch('ws-1'));
	await fireEvent.click(inSwitch('ws-1'));
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});
