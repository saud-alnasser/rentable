import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupNoWorkspace from '$lib/layout/component/startup-no-workspace.svelte';
import StartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
import { fakeJoinedOrganization } from '$lib/platform/tests/testing.ts';

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
		organizations: [fakeJoinedOrganization()],
		isSigningIn: false,
		errorMessage: null,
		onSignIn: noop,
		onSetUpOrganization: noop,
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

test('a member with no workspace is told so, by organization name', () => {
	loadLocale('en');
	setLocale('en');
	render(StartupNoWorkspace, { organizationName: 'Acme Rentals' });

	expect(screen.getByText(en.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText(en.layout.noWorkspace.description)).toBeDefined();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	render(StartupNoWorkspace, { organizationName: 'شركة' });

	expect(screen.getByText(ar.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText('شركة')).toBeDefined();

	setLocale('en');
});
