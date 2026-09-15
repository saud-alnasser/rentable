import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import RoleDialog from '$lib/organization/component/role-dialog.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import { EVERY_ADMINISTRATION, maskOf, permits } from '@rentable/workspace-permission';

/**
 * THE ROLE AND ITS ACTS, RENDERED
 *
 * Criterion 6 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] from the
 * screen's side: the roles a member can be given, a checkbox per act, and the one refusal the
 * spec names in words rather than by hiding the control.
 *
 * **Giving somebody an act that signs a row is the owner's alone**, because only the owner's
 * vault derives the key that certifies a signer. So for a caller who is not the owner, a signing
 * act the member does not already hold is drawn refused and the sentence names the owner; an act
 * they do hold stays reachable, because narrowing anybody is theirs. `renameWorkspace` signs
 * nothing and is the exception in the other direction.
 *
 * The surface submits through the form's own submit, which this one can fire: the dialog holds a
 * choice between fixed values and declares no schema, so nothing here reaches SvelteKit's
 * `applyAction`.
 */

const noop = () => {};

const inProvider = (direction: 'ltr' | 'rtl' = 'ltr') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const dialog = (
	overrides: Partial<Parameters<typeof render<typeof RoleDialog>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		RoleDialog,
		{
			open: true,
			onOpenChange: noop,
			username: 'ada',
			role: 'member',
			permissions: 0,
			canGrantSigning: true,
			isSaving: false,
			onSave: noop,
			...overrides
		},
		inProvider(direction)
	);

const box = (act: string) =>
	document.querySelector<HTMLButtonElement>(`[data-act="${act}"] [data-slot=checkbox]`);
const surface = () => document.querySelector('[data-slot=form-surface]');
const submit = async () => {
	const form = document.querySelector('form')!;

	await fireEvent.submit(form);
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('the dialog is a light form surface offering a role and a checkbox for every act', () => {
	dialog();

	expect(surface()).not.toBeNull();
	// light: the centred panel rather than the edge sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.organization.dashboard.changeRoleTitle)).toBeDefined();
	expect(
		screen.getByText(
			en.organization.dashboard.changeRoleDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();

	expect(
		Array.from(document.querySelectorAll('[data-act]')).map((field) =>
			field.getAttribute('data-act')
		)
	).toEqual([...EVERY_ADMINISTRATION]);
	expect(screen.getByText(en.organization.dashboard.actInviteMember)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.actGrantWorkspace)).toBeDefined();
});

test('it opens on what the row holds, and writes the role and the acts together', async () => {
	const saved: string[] = [];

	dialog({
		role: 'member',
		permissions: maskOf('renameMember'),
		onSave: (role, permissions) => saved.push(`${role}:${permissions}`)
	});

	expect(box('renameMember')?.getAttribute('data-state')).toBe('checked');
	expect(box('inviteMember')?.getAttribute('data-state')).toBe('unchecked');

	await fireEvent.click(box('inviteMember')!);
	await submit();

	expect(saved).toEqual([`member:${maskOf('renameMember', 'inviteMember')}`]);
});

// requirement 6: a role is a bundle somebody is created with, and the column is the truth. So
// picking one fills the boxes in and leaves them editable.
test('picking a role fills in what that role administers, and the boxes stay editable', async () => {
	const saved: number[] = [];

	dialog({ onSave: (_role, permissions) => saved.push(permissions) });

	await openSelect(document.querySelector<HTMLElement>('#member-role')!);
	await chooseOption(screen.getByRole('option', { name: en.layout.signIn.roleAdministrator }));

	for (const act of EVERY_ADMINISTRATION) {
		expect(box(act)?.getAttribute('data-state'), act).toBe('checked');
	}

	await fireEvent.click(box('removeMember')!);
	await submit();

	expect(saved).toHaveLength(1);
	expect(permits(saved[0], 'inviteMember')).toBe(true);
	expect(permits(saved[0], 'removeMember')).toBe(false);
});

// criterion 5 and requirement 6: the owner-only sentence, and the acts it covers drawn refused
// rather than absent.
test('a caller who is not the owner cannot add a signing act, and is told whose it is', () => {
	dialog({ canGrantSigning: false, permissions: maskOf('renameMember') });

	// the one act of the seven that signs nothing is theirs to give.
	expect(box('renameWorkspace')?.hasAttribute('disabled')).toBe(false);
	// and the one this member already holds is theirs to take back.
	expect(box('renameMember')?.hasAttribute('disabled')).toBe(false);

	for (const act of [
		'inviteMember',
		'removeMember',
		'changeRole',
		'resetPassword',
		'grantWorkspace'
	]) {
		expect(box(act)?.hasAttribute('disabled'), act).toBe(true);
	}

	expect(screen.getByText(en.organization.dashboard.signingIsTheOwners)).toBeDefined();
	expect(document.querySelector('[data-role-refusal]')).not.toBeNull();
});

test('and the owner is told nothing of the kind, because nothing is refused them', () => {
	dialog({ canGrantSigning: true });

	for (const act of EVERY_ADMINISTRATION) {
		expect(box(act)?.hasAttribute('disabled'), act).toBe(false);
	}
	expect(document.querySelector('[data-role-refusal]')).toBeNull();
});

test('a closed dialog puts nothing in the document', () => {
	dialog({ open: false });

	expect(surface()).toBeNull();
});

test('and in arabic the acts and the refusal read in their own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	dialog({ canGrantSigning: false }, 'rtl');

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.dashboard.actInviteMember)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.signingIsTheOwners)).toBeDefined();
	expect(ar.organization.dashboard.signingIsTheOwners).not.toBe(
		en.organization.dashboard.signingIsTheOwners
	);

	setLocale('en');
});
