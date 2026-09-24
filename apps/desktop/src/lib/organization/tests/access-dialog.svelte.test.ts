import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccessDialog from '$lib/organization/component/access-dialog.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * GRANTS, RENDERED
 *
 * Criterion 15's second dialog: every workspace with none, full access or read only, and read
 * only drawn refused for anybody but the owner, since minting a read-only credential needs the
 * Turso authority that lives on one machine (requirement 5).
 *
 * **What comes back is what changed**, by row id, so the caller writes one grant per change and
 * leaves the rest alone: a dialog that answered with its whole state would have every open of it
 * rewrite grants nobody touched.
 *
 * The surface submits through the form's own submit, which this one can fire: the dialog holds a
 * choice between fixed values and declares no schema, so nothing here reaches SvelteKit's
 * `applyAction`.
 */

const noop = () => {};

const inProvider = (direction: 'ltr' | 'rtl' = 'ltr') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const rows = [
	{ id: 'ws-1', name: 'Riyadh', access: 'full-access' as const },
	{ id: 'ws-2', name: 'Jeddah', access: 'none' as const }
];

const dialog = (
	overrides: Partial<Parameters<typeof render<typeof AccessDialog>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		AccessDialog,
		{
			open: true,
			onOpenChange: noop,
			title: en.organization.dashboard.workspaceAccessTitle,
			description: en.organization.dashboard.workspaceAccessDescription.replace(
				'{workspace:string}',
				'Riyadh'
			),
			rows,
			canGrantReadOnly: true,
			isSaving: false,
			onSave: noop,
			...overrides
		},
		inProvider(direction)
	);

const surface = () => document.querySelector('[data-slot=form-surface]');
const group = (id: string) => document.querySelector<HTMLElement>(`#access-${id}`)!;
/** the segment of a row's control that a choice is named by. */
const segment = (id: string, name: string) => within(group(id)).getByRole('radio', { name });
/** what a row's control holds now: the one segment pressed. */
const held = (id: string) =>
	within(group(id))
		.getAllByRole('radio')
		.filter((radio) => radio.getAttribute('aria-checked') === 'true')
		.map((radio) => radio.textContent?.trim());
const submit = async () => {
	const form = document.querySelector('form')!;

	await fireEvent.submit(form);
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('the dialog is a light form surface with one control per row, opened on what each holds', () => {
	dialog();

	expect(surface()).not.toBeNull();
	// light: the centred panel rather than the edge sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.organization.dashboard.workspaceAccessTitle)).toBeDefined();
	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ws-1', 'ws-2']);
	expect(screen.getByText('Riyadh')).toBeDefined();
	expect(held('ws-1')).toEqual([en.organization.dashboard.accessFull]);
	expect(held('ws-2')).toEqual([en.organization.dashboard.accessNone]);
});

test('the three choices are offered, and only what changed comes back', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	// three exclusive choices, side by side as a choice of three is ([[rules/interface]], *Field
	// kinds*).
	expect(
		within(group('ws-2'))
			.getAllByRole('radio')
			.map((radio) => radio.textContent?.trim())
	).toEqual([
		en.organization.dashboard.accessNone,
		en.organization.dashboard.accessFull,
		en.organization.dashboard.accessReadOnly
	]);

	await fireEvent.click(segment('ws-2', en.organization.dashboard.accessFull));
	await submit();

	// the row that was left alone is not a change, so nothing is written on it.
	expect(saved).toEqual([[{ id: 'ws-2', access: 'full-access' }]]);
});

test('taking a grant back is a change to none', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(segment('ws-1', en.organization.dashboard.accessNone));
	await submit();

	expect(saved).toEqual([[{ id: 'ws-1', access: 'none' }]]);
});

// requirement 5: read only is minted on the owner's machine, so for anybody else it is drawn
// refused and the sentence names the owner.
test('read only is refused for anybody but the owner, in words rather than by hiding it', async () => {
	dialog({ canGrantReadOnly: false });

	expect(segment('ws-2', en.organization.dashboard.accessReadOnly).hasAttribute('disabled')).toBe(
		true
	);
	expect(segment('ws-2', en.organization.dashboard.accessFull).hasAttribute('disabled')).toBe(
		false
	);
	expect(screen.getByText(en.organization.dashboard.readOnlyIsTheOwners)).toBeDefined();
	expect(document.querySelector('[data-access-refusal]')).not.toBeNull();
});

test('and the owner meets no refusal', () => {
	dialog({ canGrantReadOnly: true });

	expect(document.querySelector('[data-access-refusal]')).toBeNull();
	expect(segment('ws-2', en.organization.dashboard.accessReadOnly).hasAttribute('disabled')).toBe(
		false
	);
});

// pressing the choice a row already holds would unset a single group; a row always holds one.
test('pressing the choice already held leaves it held, and writes nothing', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(segment('ws-1', en.organization.dashboard.accessFull));

	expect(held('ws-1')).toEqual([en.organization.dashboard.accessFull]);

	await submit();

	expect(saved).toEqual([[]]);
});

test('a closed dialog puts nothing in the document', () => {
	dialog({ open: false });

	expect(surface()).toBeNull();
});

test('and in arabic the choices and the refusal read in their own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	dialog(
		{
			canGrantReadOnly: false,
			title: ar.organization.dashboard.workspaceAccessTitle,
			description: ar.organization.dashboard.workspaceAccessDescription.replace(
				'{workspace}',
				'Riyadh'
			)
		},
		'rtl'
	);

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.dashboard.workspaceAccessTitle)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.readOnlyIsTheOwners)).toBeDefined();
	expect(ar.organization.dashboard.readOnlyIsTheOwners).not.toBe(
		en.organization.dashboard.readOnlyIsTheOwners
	);

	setLocale('en');
});
