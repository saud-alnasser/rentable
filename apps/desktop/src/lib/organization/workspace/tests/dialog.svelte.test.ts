import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import type { Writable } from 'svelte/store';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceDialog from '$lib/organization/workspace/component/dialog.svelte';
import { WORKSPACE_NAME_LIMIT } from '$lib/sync/host';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE NEW-WORKSPACE DIALOG, RENDERED
 *
 * Requirement 13 of the redesign: the dialog and the walk's third step draw one workspace form,
 * so a name over the limit is refused with the same sentence in both. `setup.test.ts` pins that
 * sentence to the schema they share; what is asserted here is that the dialog draws the shared
 * field, on the shared form surface, and that the sentence a person sees is that one.
 *
 * The refusal is reached the way a person first meets it, by leaving the field, which is
 * client-side validation and needs no submit. A submit is fired only where what it leaves behind
 * is the point: a create that fails keeps the name typed (effort 854, requirement 11).
 */

const hooks = vi.hoisted(() => ({
	page: null as Writable<Record<string, unknown>> | null
}));

// **The form's own answer to a submit is applied as SvelteKit applies it**, as
// `organization/setup/tests/first-run.svelte.test.ts` does: `applyAction` sets the page's `form`
// and `status`, and superforms reads the page and resets a valid form on a success. A no-op here
// would skip that reset, and with it the defect this pins. The page is a store of this file's own,
// since this runner has no application root to hold one.
vi.mock('$app/stores', async (original) => {
	const { writable } = await import('svelte/store');

	hooks.page = writable<Record<string, unknown>>({});

	return { ...(await original<Record<string, unknown>>()), page: hooks.page };
});

vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async (result: { type: string; status?: number; data?: unknown }) => {
		if (result.type === 'error' || result.type === 'redirect') return;

		hooks.page?.update((page) => ({ ...page, form: result.data, status: result.status }));
	}
}));

const noop = () => {};

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
	expect(screen.getByText(toTitleCase(en.layout.workspaceMenu.create))).toBeDefined();
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

// effort 854, requirement 11: a create that fails leaves the dialog open, and the name typed is
// still in the field to be pressed again, rather than emptied by the submit that carried it.
test('a create that fails keeps the name typed', async () => {
	loadLocale('en');
	setLocale('en');
	const created: string[] = [];
	dialog({ onCreate: (name: string) => void created.push(name) });

	const input = nameInput()!;

	await fireEvent.input(input, { target: { value: 'North tower' } });
	await fireEvent.submit(input.closest('form')!);

	await waitFor(() => expect(created).toEqual(['North tower']));
	// a reset would land after the create was handed on, so it is given the time to.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(nameInput()?.value).toBe('North tower');
});
