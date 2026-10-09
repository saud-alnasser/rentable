import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ComplexForm from '$lib/complex/component/form.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';

/**
 * THE COMPLEX FORM, CLOSED BEFORE IT IS SAVED
 *
 * Requirement 10 of effort 861: a form with changes asks before it closes, and one with none
 * closes at once. A new complex is created with its units, and the units the reader names are
 * held by the unit entry rather than by a field, so they are a change the form has to report
 * itself: a unit on the list, or a line still in the entry, asks as a typed name does.
 */

const COMPLEX = { id: 'complex-1', name: 'Al Nakheel', location: 'Riyadh' };

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const question = () => document.querySelector('[data-confirm-dialog]');

const cancel = () =>
	screen
		.getAllByRole('button')
		.find((button) => button.textContent?.trim() === en.common.actions.cancel)!;

function open(value?: typeof COMPLEX) {
	const onOpenChange = vi.fn();

	render(
		ComplexForm,
		{ value, open: true, onOpenChange },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	return onOpenChange;
}

test('a new complex nobody has touched closes without asking', async () => {
	const onOpenChange = open();

	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('a new complex with a line in the unit entry asks before closing', async () => {
	const onOpenChange = open();

	await fireEvent.input(screen.getByPlaceholderText(en.complexes.form.unitName), {
		target: { value: 'A1' }
	});
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('a new complex with a unit on its list asks before closing', async () => {
	const onOpenChange = open();
	const entry = screen.getByPlaceholderText(en.complexes.form.unitName);

	await fireEvent.input(entry, { target: { value: 'A1' } });
	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.add }));
	await waitFor(() => expect(entry).toHaveProperty('value', ''));
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('an edit nobody has touched closes without asking', async () => {
	const onOpenChange = open(COMPLEX);

	await waitFor(() =>
		expect(screen.getByPlaceholderText(en.common.labels.name)).toHaveProperty('value', COMPLEX.name)
	);
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('an edit with its name changed asks before closing', async () => {
	const onOpenChange = open(COMPLEX);
	const name = screen.getByPlaceholderText(en.common.labels.name);

	await waitFor(() => expect(name).toHaveProperty('value', COMPLEX.name));
	await fireEvent.input(name, { target: { value: 'Al Nakheel Towers' } });
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});
