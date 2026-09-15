import { DesignProvider } from '@rentable/design/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ChangePasswordDialog from '$lib/organization/component/change-password-dialog.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * CHOOSING A PASSWORD, RENDERED
 *
 * What the surface puts in the document once it is open: three password fields and nothing else,
 * the sentence that says why the floor exists in place of a meter, and the refusal where there is
 * one, marked on the field it belongs to.
 *
 * *It covered the startup screen a joined member met until effort 826 retired it: no password is
 * handed over any more, so nobody is admitted owing a change. It covered a form drawn inline in
 * the you section until effort 828 put the write on the shared form surface, which is the rule
 * every other write here already followed.*
 */

const noop = () => {};

const dialog = (
	overrides: Partial<Parameters<typeof render<typeof ChangePasswordDialog>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		ChangePasswordDialog,
		{
			open: true,
			onOpenChange: noop,
			currentLabel: 'current password',
			isChanging: false,
			errorMessage: null,
			onChange: noop,
			...overrides
		},
		{ wrapper: DesignProvider, wrapperProps: { strings, direction } }
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

test('the form asks for the current password and the new one twice, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual([
		'current',
		'next',
		'confirmation'
	]);
	expect(inputs.every((input) => input.type === 'password')).toBe(true);
	expect(screen.getByRole('button', { name: en.settings.you.password.change })).toBeDefined();
});

// effort 828, requirement 8: the write takes the shared form surface, light, rather than being
// drawn inline under a heading on every visit to the section.
test('it is the shared form surface, and a closed one puts nothing in the document', () => {
	loadLocale('en');
	setLocale('en');

	const open = dialog();
	const surface = document.querySelector('[data-slot=form-surface]');

	expect(surface).not.toBeNull();
	// one form, and it is the surface's own.
	expect(document.querySelectorAll('form')).toHaveLength(1);
	expect(document.querySelector('[data-slot=dialog-title]')?.textContent?.trim()).toBe(
		en.settings.you.password.change
	);
	open.unmount();

	dialog({ open: false });

	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(inputsOnScreen()).toEqual([]);
});

// criterion: the interface says why the floor exists rather than showing a meter. The sentence is
// the first run's, because a member's vault is sealed the way the owner's is.
test('the floor is explained in a sentence, and there is no meter', () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	expect(screen.getByText(en.organization.setup.passwordFloor)).toBeDefined();
	expect(
		document.querySelector('meter, progress, [role="meter"], [role="progressbar"]')
	).toBeNull();
});

// [[rules/interface]], *Validation errors*: a refusal marks its own field and no summary callout
// lists it. What the shell refuses this with is that the current password did not open the vault.
test('a refused change marks the current password rather than standing in a callout', () => {
	loadLocale('en');
	setLocale('en');
	dialog({ errorMessage: 'the sealed value did not open' });

	const refusal = screen.getByText('the sealed value did not open');
	const current = document.querySelector<HTMLInputElement>('input[name=current]');

	expect(refusal).toBeDefined();
	expect(current?.getAttribute('aria-invalid')).toBe('true');
	expect(document.querySelector('[data-slot=callout]')).toBeNull();
	// the field's own line, rather than a summary above the form.
	expect(refusal.closest('[data-slot=field]')?.contains(current!)).toBe(true);
});

test('and in arabic, with the same three fields', () => {
	loadLocale('ar');
	setLocale('ar');
	dialog({ currentLabel: ar.settings.you.password.currentLabel }, 'rtl');

	expect(screen.getByText(ar.settings.you.password.currentLabel)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.passwordFloor)).toBeDefined();
	expect(inputsOnScreen()).toHaveLength(3);
	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');

	setLocale('en');
});

// criteria 14 and 15 of the way in and the workspace control: the button carries its verb and
// every password field leads with its subject, muted, so the three fields read as the same
// control the wall's and the walk's password fields are.
test('the change button carries its verb, and each password field leads with a muted glyph', () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	const change = screen.getByRole('button', { name: en.settings.you.password.change });

	expect(change.getAttribute('type')).toBe('submit');
	expect(change.querySelector('svg')).not.toBeNull();

	for (const name of ['current', 'next', 'confirmation']) {
		const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
		const addon = input?.previousElementSibling;

		expect(addon?.getAttribute('data-slot')).toBe('input-group-addon');
		expect(addon?.querySelector('svg')).not.toBeNull();
		expect(addon?.className).toContain('text-muted-foreground');
	}
});
