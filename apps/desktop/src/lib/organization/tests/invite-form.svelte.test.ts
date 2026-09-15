import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { formatRecordDate } from '$lib/design/date';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import InviteForm from '$lib/organization/component/invite-form.svelte';
import { resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';

/**
 * THE INVITATION, RENDERED
 *
 * What the invite dialog puts in the document once it is open: a username, a role and the
 * workspaces, and no email or display name, since making an account is what an invitation is
 * (requirement 22 of effort 824); the username field leading with its subject's glyph and
 * refused under the one rule every username field reads; and once an invitation is made, one
 * link as a machine string with one copy control, no password anywhere, and the statement that
 * nothing was sent, which is the half a screen can get wrong on its own (effort 826, requirement
 * 8). *The workspaces section's own two shapes were read here until effort 826 rebuilt that list;
 * they are `workspaces.svelte.test.ts`'s, beside the rest of the rows.*
 *
 * The dialog is rendered open with its props, and no submit is fired: a superforms SPA submit
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
/** when the link and its code lapse: a week out, which is what an invitation stands for. */
const LAPSES_AT = Date.UTC(2026, 8, 22);

const invited = {
	invitationId: 'inv-1',
	username: 'sami.staff',
	joinLink: 'rentable://join/abc',
	code: '7K4M9Q',
	expiresAt: LAPSES_AT,
	unreachableWorkspaces: []
};

const form = (
	overrides: Partial<Parameters<typeof render<typeof InviteForm>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		InviteForm,
		{
			open: true,
			onOpenChange: noop,
			organizationName: 'Northwind',
			workspaces,
			canInviteAdministrators: true,
			canGrantReadOnly: true,
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

/** the addon leading the named input, inside the group that holds both. */
const addonBefore = (name: string) => {
	const input = document.querySelector(`input[name=${name}]`);
	const group = input?.closest('[data-slot=input-group]');

	return group?.querySelector('[data-slot=input-group-addon]') ?? null;
};

beforeEach(() => {
	resetOrganizationDialogs();
});

test('the dialog opens on the shared form surface and asks for a username, a role and the workspaces the inviter holds', () => {
	loadLocale('en');
	setLocale('en');
	form();

	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	// one form, and it is the surface's own.
	expect(document.querySelectorAll('form')).toHaveLength(1);
	expect(screen.getByText(en.organization.dashboard.inviteTitle)).toBeDefined();

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
	expect(screen.getByText('Riyadh')).toBeDefined();
	expect(screen.queryByText(en.organization.dashboard.cannotSend)).toBeNull();
});

// effort 826, requirement 8: a workspace is a checkbox and an access. What the surface hands up
// is a grant per checked workspace carrying that access; no submit is fired here, for the reason
// the header gives, so what is asserted is the choice on the screen.
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
// input group, muted rather than as dark as the label. requirement 14: the invite carries its
// verb's glyph.
test('the username field leads with a muted glyph, and the invite carries its verb', () => {
	loadLocale('en');
	setLocale('en');
	form();

	for (const name of ['username']) {
		const addon = addonBefore(name);
		const input = document.querySelector(`input[name=${name}]`);

		expect(addon, name).not.toBeNull();
		expect(addon?.querySelector('svg'), name).not.toBeNull();
		expect(addon?.className, name).toContain('text-muted-foreground');
		expect(
			addon!.compareDocumentPosition(input!) & Node.DOCUMENT_POSITION_FOLLOWING,
			name
		).toBeTruthy();
	}

	const invite = screen.getByRole('button', { name: en.organization.dashboard.invite });

	expect(invite.getAttribute('type')).toBe('submit');
	expect(invite.querySelector('svg')).not.toBeNull();
});

test("an administrator who is not the owner is told administrators are the owner's to invite", () => {
	loadLocale('en');
	setLocale('en');
	form({ canInviteAdministrators: false });

	expect(screen.getByText(en.organization.dashboard.administratorsAreTheOwners)).toBeDefined();
});

test('what an invitation made is one link, as a machine string, with one copy control and the statement that nothing was sent, until dismissed', async () => {
	loadLocale('en');
	setLocale('en');

	let dismissed = 0;
	form({ invited, onDismiss: () => dismissed++ });

	expect(document.querySelector('[data-invited]')).not.toBeNull();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.dashboard.cannotSend)).toBeDefined();
	// the organization the link admits into leads the panel, and the person it admits is named
	// beside the label: the link itself is opaque.
	expect(document.querySelector('[data-invited-organization]')?.textContent).toBe('Northwind');
	expect(document.querySelector('[data-invited-username]')?.textContent?.trim()).toBe(
		invited.username
	);

	const link = document.querySelector('[data-invited-link]');

	expect(link?.textContent).toBe(invited.joinLink);
	expect(link?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByText(en.organization.dashboard.invitationLinkTitle)).toBeDefined();
	// effort 826, requirement 8: one link, one copy control, and no password anywhere on the
	// panel, by element or by word.
	expect(screen.getByRole('button', { name: en.organization.setup.copyLink })).toBeDefined();
	expect(document.querySelector('[data-invited-password]')).toBeNull();
	expect(
		Array.from(document.querySelectorAll('[data-invited] button')).filter((button) =>
			button.querySelector('svg')
		)
	).toHaveLength(1);
	expect(document.querySelector('[data-invited]')?.textContent?.toLowerCase()).not.toContain(
		'generated'
	);
	// the panel does not carry the form's own description: what is on screen is the result.
	expect(screen.queryByText(en.organization.dashboard.inviteDescription)).toBeNull();

	// the panel stays until its own done control, which is the dismissal.
	expect(dismissed).toBe(0);
	await fireEvent.click(screen.getByRole('button', { name: en.organization.dashboard.done }));
	expect(dismissed).toBe(1);
});

test('the copy control hands back the link', async () => {
	loadLocale('en');
	setLocale('en');

	const copied: string[] = [];
	form({ invited, onCopy: (what, value) => copied.push(`${what}:${value}`) });

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.copyLink }));

	expect(copied).toEqual([`link:${invited.joinLink}`]);
});

// effort 828, requirement 1: the code is under the link, large enough to read out, beside the date
// the pair lapses. It has no copy control of its own, because a code copied is a code pasted beside
// the link, which is the one thing it must not be, and no control makes a fresh one, because a
// fresh code would be a fresh link text to re-send.
test('the panel shows the code under the link, with the date the pair lapses and no control to refresh it', () => {
	loadLocale('en');
	setLocale('en');
	form({ invited });

	const link = document.querySelector('[data-invited-link]')!;
	const code = document.querySelector('[data-invited-code]')!;

	expect(code.textContent?.trim()).toBe('7K4M9Q');
	expect(code.getAttribute('dir')).toBe('ltr');
	// under the link, in the document's own order.
	expect(link.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getByText(en.organization.dashboard.codeTitle)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.codeDescription)).toBeDefined();

	// the date the link and the code lapse, said as the locale says a date.
	expect(document.querySelector('[data-invited-expiry]')?.textContent?.trim()).toBe(
		en.organization.dashboard.invitationExpires.replace(
			'{date:string}',
			formatRecordDate('en', LAPSES_AT)
		)
	);

	// no countdown, no fresh-code control, and no copy control for the code: the link has the only
	// one on the panel.
	expect(document.querySelector('[data-invited-code-seconds]')).toBeNull();
	expect(document.querySelector('[data-invited-fresh-code]')).toBeNull();
	expect(
		Array.from(document.querySelectorAll('[data-invited] button')).filter(
			(button) => button.textContent?.trim() === en.organization.setup.copyLink
		)
	).toHaveLength(1);
});

test('the control that was pressed says so', () => {
	loadLocale('en');
	setLocale('en');
	form({ invited, copied: 'link' });

	expect(screen.getByRole('button', { name: en.organization.setup.linkCopied })).toBeDefined();
	expect(screen.queryByRole('button', { name: en.organization.setup.copyLink })).toBeNull();
});

// requirement 13's limit, at the moment it bites: a reset that could not restore a workspace says
// which, so the member knows whom to wait on rather than discovering it at a locked door.
test('a reset that could not restore a workspace names it, and an invitation says nothing of the kind', () => {
	loadLocale('en');
	setLocale('en');

	const reset = form({
		invited: { ...invited, unreachableWorkspaces: [{ id: 'ws-2', name: 'South' }] }
	});
	const notice = document.querySelector('[data-invited-unreachable]');

	expect(notice?.textContent).toContain('South');
	expect(notice?.textContent).toBe(
		en.organization.dashboard.unreachableWorkspaces.replace('{workspaces}', 'South')
	);
	reset.unmount();

	form({ invited });

	expect(document.querySelector('[data-invited-unreachable]')).toBeNull();
});

test('the same panel in arabic says the same, and the link still reads left to right', () => {
	loadLocale('ar');
	setLocale('ar');
	form({ invited }, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.cannotSend)).toBeDefined();
	expect(ar.organization.dashboard.cannotSend).not.toBe(en.organization.dashboard.cannotSend);
	expect(screen.getByText(ar.organization.dashboard.invitationLinkTitle)).toBeDefined();
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');
	expect(document.querySelector('[data-invited-link]')?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: ar.organization.setup.copyLink })).toBeDefined();

	setLocale('en');
});

test('and the fields in arabic are the same three, named in their own words', () => {
	loadLocale('ar');
	setLocale('ar');
	form({}, 'rtl');

	const names = inputsOnScreen()
		.map((input) => input.getAttribute('name'))
		.filter((name) => name !== null)
		.sort();

	expect(names).toEqual(['username', 'workspaceIds']);
	expect(screen.getByText(ar.organization.dashboard.username)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.role)).toBeDefined();
	expect(ar.organization.dashboard.username).not.toBe(en.organization.dashboard.username);

	setLocale('en');
});

test('a closed dialog puts nothing in the document', () => {
	loadLocale('en');
	setLocale('en');
	form({ open: false });

	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(inputsOnScreen()).toEqual([]);
});
