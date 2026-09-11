import { DesignProvider, type DesignStrings } from '@rentable/design/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import InviteForm from '$lib/organization/component/invite-form.svelte';
import Workspaces from '$lib/organization/component/workspaces.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE INVITATION, RENDERED
 *
 * What the dashboard puts in the document once an invitation is made: the link and the password
 * as machine strings, and the statement that nothing was sent, which is requirement 7's half that
 * a screen can get wrong on its own. And the workspace section's two shapes: the owner's form,
 * and the sentence everybody else gets instead of it.
 */

const noop = () => {};

/**
 * the role select is a design primitive and reads the provider; every string it could ask for
 * comes back as its own name in braces, which no assertion below looks for.
 */
const strings = new Proxy({} as DesignStrings, {
	get: (_, key) => (key === 'moreRecords' ? (count: number) => `{${count}}` : `{${String(key)}}`)
});
const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const workspaces = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		databaseName: 'ws-1',
		databaseHostname: 'ws-1.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access'
	}
];
const invited = {
	memberId: 'member-2',
	invitationId: 'invitation-1',
	joinLink: 'rentable://join/abc',
	generatedPassword: 'abcde-fghjk-mnpqr-stuvw',
	expiresAt: 0
};

const form = (
	overrides: Partial<Parameters<typeof render<typeof InviteForm>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		InviteForm,
		{
			workspaces,
			canInviteAdministrators: true,
			isInviting: false,
			invited: null,
			copied: null,
			onInvite: noop,
			onCopy: noop,
			onDismiss: noop,
			...overrides
		},
		inProvider(direction)
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

test('the form asks for an address, a name, a role and the workspaces the inviter holds', () => {
	loadLocale('en');
	setLocale('en');
	form();

	const names = inputsOnScreen()
		.map((input) => input.getAttribute('name'))
		.filter((name) => name !== null)
		.sort();

	expect(names).toEqual(['displayName', 'email', 'workspaceIds']);
	expect(screen.getByText('Riyadh')).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.dashboard.invite })).toBeDefined();
	expect(screen.queryByText(en.organization.dashboard.cannotSend)).toBeNull();
});

test("an administrator who is not the owner is told administrators are the owner's to invite", () => {
	loadLocale('en');
	setLocale('en');
	form({ canInviteAdministrators: false });

	expect(screen.getByText(en.organization.dashboard.administratorsAreTheOwners)).toBeDefined();
});

test('what an invitation made is shown once, as machine strings, with the statement that nothing was sent', () => {
	loadLocale('en');
	setLocale('en');
	form({ invited });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.dashboard.cannotSend)).toBeDefined();

	const link = document.querySelector('[data-invited-link]');
	const password = document.querySelector('[data-invited-password]');

	expect(link?.textContent).toBe(invited.joinLink);
	expect(link?.getAttribute('dir')).toBe('ltr');
	expect(password?.textContent).toBe(invited.generatedPassword);
	expect(password?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: en.organization.setup.copyLink })).toBeDefined();
	expect(
		screen.getByRole('button', { name: en.organization.dashboard.copyPassword })
	).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.passwordOnce)).toBeDefined();
});

test('the same panel in arabic says the same, and the two strings still read left to right', () => {
	loadLocale('ar');
	setLocale('ar');
	form({ invited }, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.cannotSend)).toBeDefined();
	expect(document.querySelector('[data-invited-link]')?.getAttribute('dir')).toBe('ltr');
	expect(document.querySelector('[data-invited-password]')?.getAttribute('dir')).toBe('ltr');
	expect(
		screen.getByRole('button', { name: ar.organization.dashboard.copyPassword })
	).toBeDefined();
});

test('the workspace section draws the form for the owner', () => {
	loadLocale('en');
	setLocale('en');
	render(Workspaces, { workspaces, canCreate: true, isCreating: false, onCreate: noop });

	expect(document.querySelector('[data-workspace-form]')).not.toBeNull();
	expect(screen.queryByText(en.layout.noWorkspace.ownerOnly)).toBeNull();
	expect(screen.getByText('Riyadh')).toBeDefined();
});

// requirement 12 from the screen's side: no request queue, a sentence naming whom to ask.
test('the workspace section tells everybody else to ask the owner, and offers no form', () => {
	loadLocale('en');
	setLocale('en');
	render(Workspaces, { workspaces, canCreate: false, isCreating: false, onCreate: noop });

	expect(document.querySelector('[data-workspace-form]')).toBeNull();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.layout.noWorkspace.ownerOnly)).toBeDefined();
	expect(screen.getByText('Riyadh')).toBeDefined();
});
