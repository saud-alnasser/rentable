import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountForm from '$lib/organization/component/account-form.svelte';
import { resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';

/**
 * THE ACCOUNT FORM, RENDERED
 *
 * What the account form puts in the document once it is open: a username, a role, what the person
 * may do and the workspaces, and no email or display name, since an account is a username
 * (requirement 22 of effort 824); the username field leading with its subject's glyph and refused
 * under the one rule every username field reads.
 *
 * **And nothing handed over** (effort 828, requirement 20). The account holds no password until a
 * link is made for it, which is its own act on the account, so this form ends where every other
 * create form ends. *It showed the link in a result panel until effort 828 split the two; the
 * panel is `made-link.svelte.test.ts`'s now.*
 *
 * The form is rendered open with its props, and no submit is fired: a superforms SPA submit
 * reaches SvelteKit's `applyAction`, which this runner does not carry, so what is asserted is what
 * was rendered and what the controls call. A refusal is reached the way a person first meets
 * it, by leaving the field.
 */

const noop = () => {};

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

const form = (
	overrides: Partial<Parameters<typeof render<typeof AccountForm>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		AccountForm,
		{
			open: true,
			onOpenChange: noop,
			workspaces,
			canInviteAdministrators: true,
			canGrantReadOnly: true,
			isCreating: false,
			onCreate: noop,
			...overrides
		},
		inProvider(direction)
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

/** the addon leading the named input, inside the group that holds both. */
const addonBefore = (name: string) => {
	const input = document.querySelector(`input[name=${name}]`);
	const group = input?.closest('[data-slot=input-group]');

	return group?.querySelector('[data-slot=input-group-addon]') ?? null;
};

beforeEach(() => {
	resetOrganizationDialogs();
});

test('the form opens on the shared form surface and asks for a username, a role, the acts and the workspaces', () => {
	loadLocale('en');
	setLocale('en');
	form();

	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	// one form, and it is the surface's own.
	expect(document.querySelectorAll('form')).toHaveLength(1);
	expect(screen.getByText(en.organization.dashboard.accountTitle)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.accountDescription)).toBeDefined();

	const names = inputsOnScreen()
		.map((input) => input.getAttribute('name'))
		.filter((name) => name !== null)
		.sort();

	expect(names).toEqual(['username', 'workspaceIds']);
	// requirement 22: the username is the whole of the identity; nothing asks for an address or a
	// display name, by name or by kind.
	expect(document.querySelector('[name=email]')).toBeNull();
	expect(document.querySelector('[name=displayName]')).toBeNull();
	expect(document.querySelector('input[type=email]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.username)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.role)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.permissionsLegend)).toBeDefined();
	expect(screen.getByText('Riyadh')).toBeDefined();
	// effort 828, requirement 20: nothing is handed over here, so nothing on this surface shows a
	// link or says that the application cannot send one.
	expect(screen.queryByText(en.organization.dashboard.cannotSend)).toBeNull();
	expect(document.querySelector('[data-link-handover]')).toBeNull();
});

// effort 826, requirement 6: the role is the bundle and the acts are the truth, so picking a role
// fills the boxes in and leaves them editable. No submit is fired here, for the reason the header
// gives, so what is asserted is the choice on the screen.
test('picking a role fills the acts in, and each act stays editable', async () => {
	loadLocale('en');
	setLocale('en');
	form();

	const inviteAct = document.querySelector('#account-act-inviteMember')!;

	expect(inviteAct.getAttribute('data-state')).toBe('unchecked');

	await openSelect(document.querySelector<HTMLElement>('#account-role')!);
	await chooseOption(screen.getByRole('option', { name: en.layout.signIn.roleAdministrator }));

	await waitFor(() => {
		expect(document.querySelector('#account-act-inviteMember')?.getAttribute('data-state')).toBe(
			'checked'
		);
	});

	await fireEvent.click(document.querySelector('#account-act-inviteMember')!);

	expect(document.querySelector('#account-act-inviteMember')?.getAttribute('data-state')).toBe(
		'unchecked'
	);
});

// effort 826, requirement 6: handing out an act that signs a row needs the organization key, which
// only the owner's vault yields, so for anybody else those acts are drawn refused and the sentence
// names the owner. The one act that signs nothing stays theirs to give.
test('a caller who is not the owner may hand out only the act that signs nothing', () => {
	loadLocale('en');
	setLocale('en');
	form({ canInviteAdministrators: false });

	expect(document.querySelector('#account-act-inviteMember')?.hasAttribute('disabled')).toBe(true);
	expect(document.querySelector('#account-act-renameWorkspace')?.hasAttribute('disabled')).toBe(
		false
	);
	expect(screen.getByText(en.organization.dashboard.signingIsTheOwners)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.administratorsAreTheOwners)).toBeDefined();
});

// effort 826, requirement 8: a workspace is a checkbox and an access. What the surface hands up
// is a grant per checked workspace carrying that access.
test('each workspace carries an access, chosen beside the checkbox that grants it', async () => {
	loadLocale('en');
	setLocale('en');
	form();

	const access = document.querySelector<HTMLElement>('[data-invite-access="ws-1"]')!;

	// the access waits for the checkbox: a workspace nobody granted has no access to choose.
	expect(access.hasAttribute('disabled') || access.getAttribute('data-disabled') !== null).toBe(
		true
	);

	await fireEvent.click(document.querySelector('#invite-workspace-ws-1')!);
	await openSelect(access);
	await chooseOption(
		screen.getByRole('option', { name: en.organization.dashboard.accessReadOnly })
	);

	expect(access.textContent?.trim()).toBe(en.organization.dashboard.accessReadOnly);
});

// requirement 5: minting a read-only credential is the owner's, so for anybody else the choice is
// drawn refused and the sentence names the owner.
test('read only is refused for anybody but the owner, in words rather than by hiding it', async () => {
	loadLocale('en');
	setLocale('en');
	form({ canGrantReadOnly: false });

	await fireEvent.click(document.querySelector('#invite-workspace-ws-1')!);
	await openSelect(document.querySelector<HTMLElement>('[data-invite-access="ws-1"]')!);

	expect(
		screen
			.getByRole('option', { name: en.organization.dashboard.accessReadOnly })
			.getAttribute('data-disabled')
	).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.readOnlyIsTheOwners)).toBeDefined();
});

// criterion 21: the username is refused on the field with the sentence the walk's name step and
// the rename dialog refuse with, since all three read `organization/username-form.ts`.
test('a username outside the rules is refused with the one sentence every form reads', async () => {
	loadLocale('en');
	setLocale('en');
	form();

	const input = document.querySelector<HTMLInputElement>('input[name=username]')!;

	await fireEvent.input(input, { target: { value: 'sa' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');

	await fireEvent.input(input, { target: { value: 'sami@example.com' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
});

// requirement 15 of the redesign: the username field leads with its subject's glyph inside the
// input group, muted rather than as dark as the label. requirement 14: the primary carries its
// verb's glyph.
test('the username field leads with a muted glyph, and the primary carries its verb', () => {
	loadLocale('en');
	setLocale('en');
	form();

	const addon = addonBefore('username');
	const input = document.querySelector('input[name=username]');

	expect(addon).not.toBeNull();
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon?.className).toContain('text-muted-foreground');
	expect(addon!.compareDocumentPosition(input!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	const add = screen.getByRole('button', { name: en.organization.dashboard.addAccount });

	expect(add.getAttribute('type')).toBe('submit');
	expect(add.querySelector('svg')).not.toBeNull();
});

test('the fields in arabic are the same, named in their own words', () => {
	loadLocale('ar');
	setLocale('ar');
	form({}, 'rtl');

	const names = inputsOnScreen()
		.map((input) => input.getAttribute('name'))
		.filter((name) => name !== null)
		.sort();

	expect(names).toEqual(['username', 'workspaceIds']);
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.dashboard.username)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.role)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.accountTitle)).toBeDefined();
	expect(ar.organization.dashboard.username).not.toBe(en.organization.dashboard.username);

	setLocale('en');
});

test('a closed form puts nothing in the document', () => {
	loadLocale('en');
	setLocale('en');
	form({ open: false });

	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(inputsOnScreen()).toEqual([]);
});
