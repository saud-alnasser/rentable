import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantForm from '$lib/tenant/component/form.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE TENANT FORM, CLOSED ON A RECORD
 *
 * Requirement 10 of effort 861: a form with changes asks before it closes, and one with none
 * closes at once. An edit opens filled with the record it edits, and that filling is the form's,
 * not the reader's, so an edit nobody has touched is a form with no changes. The question itself
 * is the form surface's and is tested there; what is pinned here is that the tenant form tells
 * the surface the truth about whether it holds anything to lose.
 *
 * Escape and the cancel button stand for every close: the surface routes the overlay and the
 * corner control through the same place as Escape.
 */

const TENANT = {
	id: 'tenant-1',
	name: 'Noura Alharbi',
	nationalId: '1000000001',
	phone: '+966500000001'
};

afterEach(() => {
	document.body.innerHTML = '';
});

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

const question = () => document.querySelector('[data-confirm-dialog]');

/** opens the form on the tenant, and waits for the surface to take focus as it does on open. */
async function openEdit() {
	const onOpenChange = vi.fn();

	render(
		TenantForm,
		{ value: TENANT, open: true, onOpenChange },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	const name = screen.getByPlaceholderText<HTMLInputElement>(en.common.labels.name);

	await waitFor(() => expect(name.value).toBe(TENANT.name));
	await waitFor(() =>
		expect(name.closest('[role=dialog]')?.contains(document.activeElement)).toBe(true)
	);

	return { onOpenChange, name };
}

const cancel = () =>
	screen
		.getAllByRole('button')
		.find((button) => button.textContent?.trim() === en.common.actions.cancel)!;

test('an edit nobody has touched closes on Escape without asking', async () => {
	const { onOpenChange, name } = await openEdit();

	name.focus();
	await fireEvent.keyDown(name, { key: 'Escape' });

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('an edit nobody has touched closes on cancel without asking', async () => {
	const { onOpenChange } = await openEdit();

	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('an edit with a field changed asks before Escape closes it', async () => {
	const { onOpenChange, name } = await openEdit();

	await fireEvent.input(name, { target: { value: 'Noura Alotaibi' } });
	name.focus();
	await fireEvent.keyDown(name, { key: 'Escape' });

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('an edit with a field changed asks before cancel closes it', async () => {
	const { onOpenChange, name } = await openEdit();

	await fireEvent.input(name, { target: { value: 'Noura Alotaibi' } });
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('a field changed and changed back leaves nothing to lose', async () => {
	const { onOpenChange, name } = await openEdit();

	await fireEvent.input(name, { target: { value: 'Noura Alotaibi' } });
	await fireEvent.input(name, { target: { value: TENANT.name } });
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});
