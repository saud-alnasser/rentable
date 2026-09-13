import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ChangePasswordForm from '$lib/organization/component/change-password-form.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * CHOOSING A PASSWORD, RENDERED
 *
 * What the form puts in the document: three password fields and nothing else, the sentence that
 * says why the floor exists in place of a meter, and the refusal where there is one.
 *
 * *It covered the startup screen a joined member met as well, until effort 826 retired it: no
 * password is handed over any more, so nobody is admitted owing a change.*
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

test('and in arabic, with the same three fields', () => {
	loadLocale('ar');
	setLocale('ar');
	render(ChangePasswordForm, {
		currentLabel: ar.account.password.currentLabel,
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	expect(screen.getByText(ar.account.password.currentLabel)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.passwordFloor)).toBeDefined();
	expect(inputsOnScreen()).toHaveLength(3);
});

// criteria 14 and 15 of the way in and the workspace control: the button carries its verb and
// every password field leads with its subject, muted, so the three fields read as the same
// control the wall's and the walk's password fields are.
test('the change button carries its verb, and each password field leads with a muted glyph', () => {
	loadLocale('en');
	setLocale('en');
	render(ChangePasswordForm, {
		currentLabel: 'current password',
		isChanging: false,
		errorMessage: null,
		onChange: noop
	});

	const change = screen.getByRole('button', { name: en.account.password.change });

	expect(change.querySelector('svg')).not.toBeNull();

	for (const name of ['current', 'next', 'confirmation']) {
		const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
		const addon = input?.previousElementSibling;

		expect(addon?.getAttribute('data-slot')).toBe('input-group-addon');
		expect(addon?.querySelector('svg')).not.toBeNull();
		expect(addon?.className).toContain('text-muted-foreground');
	}
});
