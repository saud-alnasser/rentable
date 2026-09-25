import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountForm from '$lib/organization/component/account-form.svelte';
import MemberSheet from '$lib/organization/component/member-sheet.svelte';
import { resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import { fakeOrganizationRoles } from '$lib/platform/tests/testing';
import { BUILT_IN, maskOf } from '@rentable/workspace-permission';

/**
 * THE ACCOUNT FORM, RENDERED
 *
 * What the account form puts in the document once it is open: a username, a role, what the person
 * may do flag by flag and the workspaces, and no email or display name, since an account is a username
 * (requirement 22 of effort 824); the username field leading with its subject's glyph and refused
 * under the one rule every username field reads.
 *
 * **And nothing handed over** (effort 828, requirement 20). The account holds no password until a
 * link is made for it, which is its own act on the account, so this form ends where every other
 * create form ends. *It showed the link in a result panel until effort 828 split the two; the
 * panel is `made-link.svelte.test.ts`'s now.*
 *
 * **It is laid out as the member's sheet is** (ticket 42 of effort 832): the same sections, in the
 * same order, from the same pieces, so the two read as one surface in two moments. The last tests
 * here render both and compare.
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
			roles: fakeOrganizationRoles(),
			readerRank: BUILT_IN.owner.rank,
			readerPermissions: BUILT_IN.owner.mask,
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

/** what the sheet on screen draws, section by section, in order. */
const sections = () =>
	Array.from(document.querySelectorAll('[data-sheet-section]')).map((section) =>
		section.getAttribute('data-sheet-section')
	);

test('the form opens on the shared form surface and asks for a username, a role, what they may do and the workspaces', () => {
	loadLocale('en');
	setLocale('en');
	form();

	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	// one form, and it is the surface's own.
	expect(document.querySelectorAll('form')).toHaveLength(1);
	expect(screen.getByText(toTitleCase(en.organization.dashboard.memberTitle))).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.memberDescription)).toBeDefined();

	const names = inputsOnScreen()
		.map((input) => input.getAttribute('name'))
		.filter((name) => name !== null)
		.sort();

	// the one input a schema refuses: the role, what they may do and the workspaces are a chooser,
	// boxes and segments, none of them a named input.
	expect(names).toEqual(['username']);
	// requirement 22: the username is the whole of the identity; nothing asks for an address or a
	// display name, by name or by kind.
	expect(document.querySelector('[name=email]')).toBeNull();
	expect(document.querySelector('[name=displayName]')).toBeNull();
	expect(document.querySelector('input[type=email]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.username)).toBeDefined();
	expect(document.querySelector('#account-role-tray-legend')?.textContent?.trim()).toBe(
		en.organization.dashboard.role
	);
	expect(screen.getByText(en.organization.override.legend)).toBeDefined();
	expect(screen.getByText('Riyadh')).toBeDefined();
	// effort 828, requirement 20: nothing is handed over here, so nothing on this surface shows a
	// link or says that the application cannot send one.
	expect(screen.queryByText(en.organization.dashboard.cannotSend)).toBeNull();
	expect(document.querySelector('[data-link-handover]')).toBeNull();
});

// effort 838, requirement 5: an account is made in one role with one override, and opens on the
// member role with nothing changed. Picking a role reads what they may do against it at once.
test('an account opens on the member role with nothing changed, and a role picked is read at once', async () => {
	loadLocale('en');
	setLocale('en');
	form();

	const trigger = document.querySelector<HTMLElement>('#account-role')!;

	expect(trigger.textContent?.trim()).toBe(en.layout.signIn.roleMember);
	expect(
		document.querySelector('[data-override-result="deletePayment"]')?.textContent?.trim()
	).toBe(en.organization.override.no);

	await openSelect(trigger);
	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-role="manager"]')!
	);

	expect(trigger.textContent?.trim()).toBe(en.layout.signIn.roleManager);
	expect(screen.getByText(en.organization.roles.manager.who)).toBeDefined();
	await waitFor(() => {
		expect(
			document.querySelector('[data-override-result="deletePayment"]')?.textContent?.trim()
		).toBe(en.organization.override.yes);
	});
});

// requirement 7: a maker in a custom role gives no role at or above their own and switches no
// flag they do not hold; both are drawn refused, with the reason where the reader can read it.
test('a maker gives no role at or above their own, and no flag they do not hold', async () => {
	loadLocale('en');
	setLocale('en');
	form({ readerRank: 750_000, readerPermissions: BUILT_IN.member.mask + maskOf('inviteMember') });

	await openSelect(document.querySelector<HTMLElement>('#account-role')!);

	const disabled = (id: string) =>
		document
			.querySelector(`[data-slot=select-item][data-role="${id}"]`)
			?.hasAttribute('data-disabled');

	expect(disabled('manager')).toBe(true);
	expect(disabled('supervisor')).toBe(true);
	expect(disabled('collector')).toBe(false);
	expect(disabled('member')).toBe(false);
	expect(
		document.querySelector('[data-sheet-section="role"] [data-role-refusal]')?.textContent?.trim()
	).toBe(en.organization.dashboard.roleOutOfReach);

	expect(document.querySelector('#account-override-deletePayment')?.hasAttribute('disabled')).toBe(
		true
	);
	expect(
		document.querySelector('[data-override-reason="deletePayment"]')?.textContent?.trim()
	).toBe(en.organization.dashboard.notHeld);
	expect(document.querySelector('#account-override-editPayment')?.hasAttribute('disabled')).toBe(
		false
	);
});

// effort 826, requirement 8: a workspace is granted at an access. Every workspace the maker holds
// is a row of three levels, and no access is what not granting it is, so each row starts there
// and says so under the control.
test('each workspace starts on no access, and is granted by choosing a level', async () => {
	loadLocale('en');
	setLocale('en');
	form();

	const access = document.querySelector<HTMLElement>('#account-access-ws-1')!;

	expect(
		within(access)
			.getAllByRole('radio')
			.map((segment) => segment.textContent?.trim())
	).toEqual([
		en.organization.dashboard.accessFull,
		en.organization.dashboard.accessReadOnly,
		en.organization.dashboard.accessNone
	]);
	expect(
		within(access)
			.getByRole('radio', { name: en.organization.dashboard.accessNone })
			.getAttribute('aria-checked')
	).toBe('true');
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.levels.none.does
	);

	const readOnly = within(access).getByRole('radio', {
		name: en.organization.dashboard.accessReadOnly
	});

	await fireEvent.click(readOnly);

	expect(readOnly.getAttribute('aria-checked')).toBe('true');
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.levels.readOnly.does
	);
});

test('with no workspace to grant, the section says so', () => {
	loadLocale('en');
	setLocale('en');
	form({ workspaces: [] });

	expect(document.querySelector('[data-access-row]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.noWorkspaceToGrant)).toBeDefined();
});

// requirement 5: minting a read-only credential is the owner's, so for anybody else the choice is
// drawn refused and the sentence names the owner.
test('read only is refused for anybody but the owner, in words rather than by hiding it', () => {
	loadLocale('en');
	setLocale('en');
	form({ canGrantReadOnly: false });

	const access = document.querySelector<HTMLElement>('#account-access-ws-1')!;

	expect(
		within(access)
			.getByRole('radio', { name: en.organization.dashboard.accessReadOnly })
			.hasAttribute('disabled')
	).toBe(true);
	expect(
		within(access)
			.getByRole('radio', { name: en.organization.dashboard.accessFull })
			.hasAttribute('disabled')
	).toBe(false);
	expect(screen.getByText(en.organization.dashboard.readOnlyIsTheOwners)).toBeDefined();
});

// criterion 21: the username is refused on the field with the sentence the walk's name step and
// the member's sheet refuse with, since all three read `organization/username-form.ts`.
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

	const add = screen.getByRole('button', { name: en.organization.dashboard.addMember });

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

	expect(names).toEqual(['username']);
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.dashboard.username)).toBeDefined();
	expect(document.querySelector('#account-role-tray-legend')?.textContent?.trim()).toBe(
		ar.organization.dashboard.role
	);
	expect(screen.getByText(ar.organization.dashboard.memberTitle)).toBeDefined();
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

// ticket 42 of effort 832: the sheet that adds a member is laid out as the sheet that edits one.
// The human saw them side by side in the running build and asked for one to read like the other,
// so the two are rendered here in turn and compared, section by section.
const editSheet = (direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		MemberSheet,
		{
			open: true,
			onOpenChange: noop,
			username: 'ada',
			roleId: 'member',
			override: 0,
			roles: fakeOrganizationRoles(),
			rows: [{ id: 'ws-1', name: 'Riyadh', access: 'none' as const }],
			readerRank: BUILT_IN.owner.rank,
			readerPermissions: BUILT_IN.owner.mask,
			canRename: true,
			canAssignRole: true,
			canOverride: true,
			canGrantWorkspace: true,
			canGrantReadOnly: true,
			isSaving: false,
			nameRefusal: null,
			roleRefusal: null,
			overrideRefusal: null,
			workspacesRefusal: null,
			onSave: noop
		},
		inProvider(direction)
	);

/** what one sheet draws: its sections, the legend each opens with, and the shapes of its controls. */
const shapeOnScreen = () => ({
	sections: sections(),
	legends: Array.from(document.querySelectorAll('[data-sheet-section]')).map(
		(section) => section.querySelector('[data-slot=field-legend]')?.textContent?.trim() ?? null
	),
	trays: document.querySelectorAll('[data-sheet-tray]').length,
	heads: document.querySelectorAll('[data-list-head]').length,
	role: document
		.querySelector('[data-sheet-section="role"] [data-role-chosen]')
		?.getAttribute('data-role-chosen'),
	flags: Array.from(document.querySelectorAll('[data-override-flag]')).map((row) =>
		row.getAttribute('data-override-flag')
	),
	levels: Array.from(
		document.querySelectorAll('[data-access-row] [data-slot=toggle-group-item]')
	).map((item) => item.getAttribute('data-level'))
});

test('the sheet that adds a member draws the sections the sheet that edits one draws, in its order', () => {
	loadLocale('en');
	setLocale('en');

	const adding = form();
	const added = shapeOnScreen();

	adding.unmount();
	editSheet();

	const edited = shapeOnScreen();

	expect(added.sections).toEqual(['name', 'role', 'override', 'workspaces']);
	expect(added).toEqual(edited);
	// the legends read as the edit sheet's do: sentence case where they render, never the
	// uppercase label the username carried.
	expect(added.legends).toEqual([
		en.organization.dashboard.username,
		en.organization.dashboard.role,
		en.organization.override.legend,
		en.settings.section.workspaces
	]);
});

test('the two sheets hold the same shape in arabic', () => {
	loadLocale('ar');
	setLocale('ar');

	const adding = form({}, 'rtl');
	const added = shapeOnScreen();

	adding.unmount();
	editSheet('rtl');

	expect(added).toEqual(shapeOnScreen());
	expect(added.legends).toContain(ar.organization.override.legend);

	setLocale('en');
});

// the username says what it is on its own line, as the edit sheet's does, and nothing on the sheet
// is the old uppercase label.
test('the username is headed as a section, with its sentence under it', () => {
	loadLocale('en');
	setLocale('en');
	form();

	const head = document.querySelector('[data-list-head="account-name"]');

	expect(head?.textContent).toContain(en.organization.dashboard.usernameDescription);
	expect(document.querySelector('[data-slot=form-label]')).toBeNull();
	expect(document.querySelector('input[name=username]')?.getAttribute('aria-labelledby')).toBe(
		'account-name-legend'
	);
});
