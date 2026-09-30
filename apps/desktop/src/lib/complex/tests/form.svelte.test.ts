import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, beforeEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ComplexForm from '$lib/complex/component/form.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE COMPLEX FORM, SUBMITTED
 *
 * A unit name still in the entry when Create is pressed stops the press: the entry asks for it to
 * be added with + first, and nothing is written or moved. What was typed into the complex's own
 * fields stays where it was. A complex is not written without a name.
 *
 * The submit is a real one, through superforms with `applyAction` off, as the tenant form's test
 * explains.
 */

const noop = () => {};

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

const open = () =>
	render(
		ComplexForm,
		{ open: true, onOpenChange: noop },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const surface = () => document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!;

test('a unit still in the entry stops Create and asks for +, and nothing moves', async () => {
	open();

	const name = screen.getByPlaceholderText(en.common.labels.name);
	const location = screen.getByPlaceholderText(en.common.labels.location);
	const entry = screen.getByPlaceholderText(en.complexes.form.unitName);

	await fireEvent.input(name, { target: { value: 'Tower' } });
	await fireEvent.input(location, { target: { value: 'Riyadh' } });
	await fireEvent.input(entry, { target: { value: 'A1' } });

	await fireEvent.submit(surface());

	await waitFor(() => expect(document.body.textContent).toContain(en.complexes.form.unitNotAdded));
	expect(document.activeElement).toBe(entry);
	expect(entry).toHaveProperty('value', 'A1');
	expect(document.body.textContent).toContain(en.complexes.form.noUnitsYet);
	expect(name).toHaveProperty('value', 'Tower');
	expect(location).toHaveProperty('value', 'Riyadh');

	// clearing the entry answers it as well as + does.
	await fireEvent.input(entry, { target: { value: '' } });

	await waitFor(() =>
		expect(document.body.textContent).not.toContain(en.complexes.form.unitNotAdded)
	);
});

test('a unit added with + is listed, and the entry is ready for the next', async () => {
	open();

	const entry = screen.getByPlaceholderText(en.complexes.form.unitName);

	await fireEvent.input(entry, { target: { value: 'A1' } });
	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.add }));

	await waitFor(() => expect(entry).toHaveProperty('value', ''));
	expect([...document.querySelectorAll('input')].some((input) => input.value === 'A1')).toBe(true);
	expect(document.body.textContent).not.toContain(en.complexes.form.unitNotAdded);
});

test('a complex with units and no name is refused on its name', async () => {
	open();

	const name = screen.getByPlaceholderText(en.common.labels.name);

	await fireEvent.input(name, { target: { value: '   ' } });
	await fireEvent.submit(surface());

	await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
	expect(document.body.textContent).toContain(en.complexes.form.nameRequired);
});
