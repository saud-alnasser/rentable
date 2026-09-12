import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupChangePassword from '$lib/layout/component/startup-change-password.svelte';
import ChangePasswordForm from '$lib/organization/component/change-password-form.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * CHOOSING A PASSWORD, RENDERED
 *
 * What the form puts in the document: three password fields and nothing else, the sentence that
 * says why the floor exists in place of a meter, and the refusal where there is one. And the
 * screen a joined member meets, which names the organization above the same form.
 */

const noop = () => {};

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

test('the form asks for the current password and the new one twice, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	render(ChangePasswordForm, {
		currentLabel: 'current password',
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual([
		'current',
		'next',
		'confirmation'
	]);
	expect(inputs.every((input) => input.type === 'password')).toBe(true);
	expect(screen.getByRole('button', { name: en.account.password.change })).toBeDefined();
});

// criterion: the interface says why the floor exists rather than showing a meter. The sentence is
// the first run's, because a member's vault is sealed the way the owner's is.
test('the floor is explained in a sentence, and there is no meter', () => {
	loadLocale('en');
	setLocale('en');
	render(ChangePasswordForm, {
		currentLabel: 'current password',
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	expect(screen.getByText(en.organization.setup.passwordFloor)).toBeDefined();
	expect(
		document.querySelector('meter, progress, [role="meter"], [role="progressbar"]')
	).toBeNull();
});

test('a refused change is said on the form', () => {
	loadLocale('en');
	setLocale('en');
	render(ChangePasswordForm, {
		currentLabel: 'current password',
		isChanging: false,
		errorMessage: 'the sealed value did not open',
		onChange: noop
	});

	expect(screen.getByText('the sealed value did not open')).toBeDefined();
});

test('the screen a joined member meets names the organization and says why it is there', () => {
	loadLocale('en');
	setLocale('en');
	render(StartupChangePassword, {
		organizationName: 'Acme Rentals',
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(screen.getByText(en.layout.changePassword.title)).toBeDefined();
	expect(screen.getByText(en.layout.changePassword.description)).toBeDefined();
	expect(screen.getByText(en.layout.changePassword.handedLabel)).toBeDefined();
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'current',
		'next',
		'confirmation'
	]);
});

test('and in arabic, with the same three fields', () => {
	loadLocale('ar');
	setLocale('ar');
	render(StartupChangePassword, {
		organizationName: 'Acme Rentals',
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	expect(screen.getByText(ar.layout.changePassword.title)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.passwordFloor)).toBeDefined();
	expect(inputsOnScreen()).toHaveLength(3);
});
