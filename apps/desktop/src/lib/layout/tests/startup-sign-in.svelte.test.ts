import { DesignProvider } from '@rentable/design/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupNoWorkspace from '$lib/layout/component/startup-no-workspace.svelte';
import StartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
import { fakeHeldOrganization } from '$lib/platform/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE WALL, RENDERED
 *
 * What the card puts in the document for each of its two situations, in both locales. The
 * password field is the only field, which is the sign-in ticket's reading of requirement 9: this
 * machine knows which member it is, and an email typed here would be compared against a local
 * string, which is exactly the check a modified client can skip.
 */

const noop = () => {};

const card = (
	situation: 'noOrganization' | 'locked',
	overrides: Partial<Parameters<typeof render<typeof StartupSignIn>>[1]> = {}
) =>
	render(StartupSignIn, {
		situation,
		organizations: [fakeHeldOrganization()],
		isSigningIn: false,
		errorMessage: null,
		onSignIn: noop,
		onSetUpOrganization: noop,
		onJoinByLink: noop,
		...overrides
	});

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

test('a locked machine names the organization and asks for a password, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['password']);
	expect(inputs[0]?.type).toBe('password');
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(screen.getByRole('button', { name: en.layout.signIn.unlock })).toBeDefined();
	expect(screen.getByText(en.layout.signIn.organizationDescription)).toBeDefined();
});

test('a machine that has joined nothing asks for nothing and offers the first run', () => {
	loadLocale('en');
	setLocale('en');
	card('noOrganization', { organizations: [] });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.layout.signIn.noOrganizationTitle)).toBeDefined();
	expect(screen.getByRole('button', { name: en.layout.signIn.setUpOrganization })).toBeDefined();
	// and the other way in: an invitation somebody was handed, which opens the join screen.
	expect(screen.getByRole('button', { name: en.layout.signIn.openInvitation })).toBeDefined();
});

test('a password that did not open is said on the wall, with the one sentence allowed', () => {
	loadLocale('en');
	setLocale('en');
	card('locked', { errorMessage: 'the sealed value did not open' });

	expect(screen.getByText('the sealed value did not open')).toBeDefined();
});

// requirement 21: both locales, and the same one field.
test('the wall renders in arabic with the same one field', () => {
	loadLocale('ar');
	setLocale('ar');
	card('locked');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['password']);
	expect(screen.getByText(ar.layout.signIn.organizationDescription)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.layout.signIn.unlock })).toBeDefined();

	setLocale('en');
});

// effort 824, requirement 7 as amended on 2026-09-13: several organizations stay in the select,
// and nothing is drawn on the wall in place of the rows the human withdrew.
test('a machine that has joined two organizations shows them in the select, the first chosen', () => {
	loadLocale('en');
	setLocale('en');
	// the select's content reads `DesignProvider`, which the wall otherwise never needs.
	render(
		StartupSignIn,
		{
			situation: 'locked',
			organizations: [
				fakeHeldOrganization(),
				fakeHeldOrganization({ id: 'beta', name: 'Beta Holdings', role: 'member' })
			],
			isSigningIn: false,
			errorMessage: null,
			onSignIn: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop
		},
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(screen.queryAllByRole('radio')).toEqual([]);
	const trigger = document.querySelector('[data-slot=select-trigger]');
	expect(trigger?.id).toBe('sign-in-organization');
	expect(trigger?.textContent).toContain('Acme Rentals');
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['password']);
});

test('one organization is named as a line of text, not offered as a choice', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(screen.queryAllByRole('radio')).toEqual([]);
	expect(document.querySelector('[data-slot=select-trigger]')).toBeNull();
	const line = document.querySelector('[data-sign-in-organization="acme"]');
	expect(line?.tagName).toBe('P');
	expect(line?.textContent).toContain('Acme Rentals');
	expect(line?.textContent).toContain(en.layout.signIn.roleOwner);
});

// requirements 14 and 15: the unlock carries its verb, the password field its subject, muted.
test('the unlock button carries a glyph and the password field a muted leading one', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(
		screen.getByRole('button', { name: en.layout.signIn.unlock }).querySelector('svg')
	).not.toBeNull();

	const addon = document.querySelector('[data-slot=input-group-addon]');
	const password = document.querySelector('input[name=password]');
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon!.compareDocumentPosition(password!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(addon?.className).toContain('text-muted-foreground');
});

test('a member with no workspace is told so, by organization name', () => {
	loadLocale('en');
	setLocale('en');
	render(StartupNoWorkspace, {
		organizationName: 'Acme Rentals',
		canCreate: true,
		isCreating: false,
		onCreate: () => {}
	});

	expect(screen.getByText(en.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText(en.layout.noWorkspace.description)).toBeDefined();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	// the owner is offered the one way past it: a name, and a create.
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);

	// requirement 15 of the redesign: the field leads with its subject's glyph inside the input
	// group, and the glyph is muted rather than as dark as the label.
	const addon = document.querySelector('[data-slot=input-group-addon]');

	expect(addon).not.toBeNull();
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon?.className).toContain('text-muted-foreground');
	expect(addon?.parentElement?.getAttribute('data-slot')).toBe('input-group');
	expect(addon?.parentElement?.querySelector('input[name=name]')).not.toBeNull();

	// requirement 14: the create carries its verb's glyph before its label.
	const create = screen.getByRole('button', { name: en.layout.noWorkspace.create });

	expect(create.querySelector('svg')).not.toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	render(StartupNoWorkspace, {
		organizationName: 'شركة',
		canCreate: false,
		isCreating: false,
		onCreate: () => {}
	});

	expect(screen.getByText(ar.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText('شركة')).toBeDefined();
	// and a member who is not the owner is told whose act it is, with nothing to press.
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(ar.layout.noWorkspace.ownerOnly)).toBeDefined();

	setLocale('en');
});
