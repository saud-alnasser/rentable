import { DesignProvider, type DesignStrings } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceDialog from '$lib/organization/component/workspace-dialog.svelte';
import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE NEW-WORKSPACE DIALOG, RENDERED
 *
 * Requirement 13 of the redesign: the dialog and the walk's third step draw one workspace form,
 * so a name over the limit is refused with the same sentence in both. `setup.test.ts` pins that
 * sentence to the schema they share; what is asserted here is that the dialog draws the shared
 * field, on the shared form surface, and that the sentence a person sees is that one.
 *
 * No submit is fired: a superforms SPA submit reaches SvelteKit's `applyAction`, which this
 * runner does not carry. The refusal is reached the way a person first meets it, by leaving the
 * field, which is client-side validation and needs no submit.
 */

const noop = () => {};

const strings = new Proxy({} as DesignStrings, {
	get: (_, key) => (key === 'moreRecords' ? (count: number) => `{${count}}` : `{${String(key)}}`)
});
const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const dialog = (
	overrides: Partial<Parameters<typeof render<typeof WorkspaceDialog>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		WorkspaceDialog,
		{ open: true, onOpenChange: noop, isCreating: false, onCreate: noop, ...overrides },
		inProvider(direction)
	);

const nameInput = () => document.querySelector<HTMLInputElement>('input[name=name]');

test('the dialog opens light on the shared form surface, and draws the one shared field', () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	const surface = document.querySelector('[data-slot=form-surface]');

	expect(surface).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.layout.workspaceMenu.create)).toBeDefined();
	expect(
		Array.from(document.querySelectorAll('input')).map((input) => input.getAttribute('name'))
	).toEqual(['name']);
	expect(screen.getByText(en.layout.noWorkspace.nameLabel)).toBeDefined();
});

// requirement 15: the field leads with its subject's glyph, muted. requirement 14: the create
// carries its verb's glyph.
test('the field leads with a muted glyph, and the create carries its verb', () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	const input = nameInput();
	const group = input?.closest('[data-slot=input-group]');
	const addon = group?.querySelector('[data-slot=input-group-addon]');

	expect(addon).not.toBeNull();
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon?.className).toContain('text-muted-foreground');
	expect(addon!.compareDocumentPosition(input!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	const create = screen.getByRole('button', { name: en.layout.noWorkspace.create });

	expect(create.getAttribute('type')).toBe('submit');
	expect(create.querySelector('svg')).not.toBeNull();
});

// criterion 13: the sentence is the one `setup.test.ts` pins to the shared schema, so the walk's
// third step and this dialog cannot refuse the same name in two voices.
test('a name over the limit is refused with the one sentence every surface reads', async () => {
	loadLocale('en');
	setLocale('en');
	dialog();

	const input = nameInput()!;

	await fireEvent.input(input, { target: { value: 'n'.repeat(WORKSPACE_NAME_LIMIT + 1) } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.workspace.nameTooLong);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
});

test('and in arabic, on the same surface read right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	dialog({}, 'rtl');

	expect(document.querySelector('[data-slot=form-surface]')?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.layout.workspaceMenu.create)).toBeDefined();

	const input = nameInput()!;

	await fireEvent.input(input, { target: { value: 'ن'.repeat(WORKSPACE_NAME_LIMIT + 1) } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(ar.workspace.nameTooLong);
	});

	setLocale('en');
});

test('while the create is under way the field waits with it, and the dialog says so', () => {
	loadLocale('en');
	setLocale('en');
	dialog({ isCreating: true });

	expect(nameInput()?.disabled).toBe(true);
	expect(screen.getByText(en.layout.noWorkspace.creating)).toBeDefined();
	expect(screen.getByRole('button', { name: en.common.actions.working })).toBeDefined();
});

test('a closed dialog puts nothing in the document', () => {
	loadLocale('en');
	setLocale('en');
	dialog({ open: false });

	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(nameInput()).toBeNull();
});
