import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccessDialog from '$lib/organization/access/component/dialog.svelte';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from '$lib/organization/tests/providers.svelte';

/**
 * A WORKSPACE'S PEOPLE, RENDERED
 *
 * The dialog a workspace's card opens: every member who could hold it, each a switch, in or out
 * (effort 838, requirement 12 as amended again and a third time; tickets 49 and 54). It is the
 * member's card read from the other end, drawn from the same list
 * (`access/component/switches.svelte`), so the refusals and their reasons are the card's: putting
 * somebody in a workspace the reader holds read only, and taking out somebody whose grant the owner
 * minted read only. A person tailored here is marked *custom here*; the tailoring itself is on
 * their card. No lock is drawn.
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

// the design and tooltip providers: a switch the reader may not turn says why in a tooltip.
const inProvider = (direction: 'ltr' | 'rtl' = 'ltr') => ({
	wrapper: Providers,
	wrapperProps: { strings, direction }
});

const rows = [
	{ id: 'ada', name: 'ada', access: 'full-access' as const, tailored: false, givable: true },
	{ id: 'sami', name: 'sami', access: 'none' as const, tailored: false, givable: true }
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
			isSaving: false,
			onSave: noop,
			...overrides
		},
		inProvider(direction)
	);

const surface = () => document.querySelector('[data-slot=form-surface]');
const inSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}`);
const mark = (id: string) => document.querySelector<HTMLElement>(`[data-access-mark="${id}"]`);
const checked = (element: HTMLElement | null) => element?.getAttribute('aria-checked') === 'true';
const dimmed = (element: HTMLElement | null) => element?.getAttribute('aria-disabled') === 'true';
const reasons = () =>
	Array.from(document.querySelectorAll('[data-access-refusal]')).map((line) =>
		line.textContent?.trim()
	);
const submit = async () => {
	const form = document.querySelector('form')!;

	await fireEvent.submit(form);
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('the dialog is a light surface with a switch per member, opened on what each holds', () => {
	dialog();

	expect(surface()).not.toBeNull();
	// light: the centred panel rather than the edge sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(
		screen.getByText(toTitleCase(en.organization.dashboard.workspaceAccessTitle))
	).toBeDefined();
	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ada', 'sami']);
	expect(checked(inSwitch('ada'))).toBe(true);
	expect(checked(inSwitch('sami'))).toBe(false);
	expect(inSwitch('ada')?.getAttribute('role')).toBe('switch');
	// in or out, and nothing beneath: no lock, and no tailoring, which is the member's card's.
	expect(document.querySelector('[data-access-lock], [data-access-lock-row]')).toBeNull();
	expect(document.querySelector('[data-tailor]')).toBeNull();
	expect(document.querySelectorAll('[role=switch]').length).toBe(2);
	expect(surface()?.textContent).not.toContain('lock');
	// no level is offered: no segment, and none of the words a level went by.
	expect(document.querySelector('[data-slot=toggle-group-item]')).toBeNull();
	expect(document.querySelector('[role=radio]')).toBeNull();
	expect(surface()?.textContent).not.toContain(en.organization.dashboard.accessFull);
	expect(surface()?.textContent).not.toContain('no access');
	// nobody is tailored and nothing is refused, so nothing is marked and no reason is said.
	expect(mark('ada')).toBeNull();
	expect(reasons()).toEqual([]);
});

// in: switching a member on is a full-access grant.
test('switching a member on puts them in at full access, and only that comes back', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(inSwitch('sami')!);

	expect(checked(inSwitch('sami'))).toBe(true);

	await submit();

	// the row that was left alone is not a change, so nothing is written on it.
	expect(saved).toEqual([[{ id: 'sami', access: 'full-access' }]]);
});

// out: switching a member off withdraws the grant.
test('switching a member off takes them out', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(inSwitch('ada')!);

	expect(checked(inSwitch('ada'))).toBe(false);

	await submit();

	expect(saved).toEqual([[{ id: 'ada', access: 'none' }]]);
});

// requirement 12 as amended a third time: a person whose permissions here differ from theirs
// across the organization is marked, beside their name and read with their switch; the mark goes
// while they are switched out.
test('a person tailored here is marked custom here, read with their switch', async () => {
	dialog({ rows: [{ ...rows[0], tailored: true }, rows[1]] });

	expect(mark('ada')?.textContent?.trim()).toBe(en.organization.workspaceSwitches.customHere);
	expect(inSwitch('ada')?.getAttribute('aria-describedby')).toBe('access-ada-mark');
	expect(mark('sami')).toBeNull();

	await fireEvent.click(inSwitch('ada')!);

	expect(mark('ada')).toBeNull();
});

// a grant the owner minted before the lock left keeps working and is drawn in. Switched off and
// on again it is back to what it held, and nothing is written.
test('a grant minted read only is in, and off and on again changes nothing', async () => {
	const saved: { id: string; access: string }[][] = [];
	const minted = [{ ...rows[0], access: 'read-only' as const, tailored: true }];

	dialog({ rows: minted, onSave: (changes) => saved.push(changes) });

	expect(checked(inSwitch('ada'))).toBe(true);
	expect(mark('ada')).not.toBeNull();

	await fireEvent.click(inSwitch('ada')!);
	await fireEvent.click(inSwitch('ada')!);
	await submit();

	expect(saved).toEqual([[]]);
});

// a grant minted read only is withdrawn as any other is, by whoever may withdraw (review round
// one of the workspace layer): the rule that kept it the owner's went with the lock.
test('a grant minted read only is taken out by anybody who may withdraw, and nothing is dimmed', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		rows: [rows[0], { ...rows[1], access: 'read-only' as const }],
		onSave: (changes) => saved.push(changes)
	});

	expect(dimmed(inSwitch('sami'))).toBe(false);
	expect(reasons()).toEqual([]);

	await fireEvent.click(inSwitch('sami')!);

	expect(checked(inSwitch('sami'))).toBe(false);

	await submit();

	expect(saved).toEqual([[{ id: 'sami', access: 'none' }]]);
});

// a granter gives only what they reach: full access is their own credential re-sealed, so where
// the reader holds this workspace read only, nobody can be put in. Taking somebody out is still
// theirs, since a withdrawal re-seals nothing.
test('a workspace the reader holds read only puts nobody in, and still withdraws', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		rows: [
			{ ...rows[0], givable: false },
			{ ...rows[1], givable: false }
		],
		onSave: (changes) => saved.push(changes)
	});

	const reason = en.organization.workspaceSwitches.notHeld;

	expect(dimmed(inSwitch('sami'))).toBe(true);
	expect(document.querySelector('#access-sami-reason')?.textContent?.trim()).toBe(reason);
	expect(reasons()).toContain(reason);

	await fireEvent.click(inSwitch('sami')!);
	expect(checked(inSwitch('sami'))).toBe(false);

	expect(dimmed(inSwitch('ada'))).toBe(false);
	await fireEvent.click(inSwitch('ada')!);
	expect(checked(inSwitch('ada'))).toBe(false);

	await submit();

	expect(saved).toEqual([[{ id: 'ada', access: 'none' }]]);
});

// ticket 50: turning a member back to what they held writes nothing, so it is never refused, even
// by a reader holding the workspace read only, who could not put them in afresh.
test('a reader holding the workspace read only switches a member out and back in, writing nothing', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		rows: [{ ...rows[0], givable: false }],
		onSave: (changes) => saved.push(changes)
	});

	await fireEvent.click(inSwitch('ada')!);
	expect(checked(inSwitch('ada'))).toBe(false);
	expect(dimmed(inSwitch('ada'))).toBe(false);
	expect(reasons()).not.toContain(en.organization.workspaceSwitches.notHeld);

	await fireEvent.click(inSwitch('ada')!);
	expect(checked(inSwitch('ada'))).toBe(true);

	await submit();

	expect(saved).toEqual([[]]);
});

// the save carries save's glyph, as the member's sheet and the role editor do, and members are
// drawn with a member's glyph rather than the tenant's person.
test('the save carries the save glyph, and each member the member glyph', () => {
	dialog();

	const save = document.querySelector('button[type=submit]');

	expect(save?.querySelector('svg')?.classList.contains('lucide-save')).toBe(true);
	expect(
		document.querySelector('[data-access-row="ada"] svg')?.classList.contains('lucide-circle-user')
	).toBe(true);
	expect(document.querySelector('[data-access-row="ada"] svg.lucide-user')).toBeNull();
});

test('with nobody to list it says there is no member to put in', () => {
	dialog({ rows: [] });

	expect(document.querySelector('[data-access-empty]')?.textContent?.trim()).toBe(
		en.organization.dashboard.noMemberToGrant
	);
});

test('a closed dialog puts nothing in the document', () => {
	dialog({ open: false });

	expect(surface()).toBeNull();
});

test('and in arabic the mark reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	dialog(
		{
			rows: [
				{ ...rows[0], tailored: true },
				{ ...rows[1], access: 'read-only' as const }
			],
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
	expect(mark('ada')?.textContent?.trim()).toBe(ar.organization.workspaceSwitches.customHere);
	expect(ar.organization.workspaceSwitches.customHere).not.toBe(
		en.organization.workspaceSwitches.customHere
	);
	expect(reasons()).toEqual([]);

	setLocale('en');
});

test('and in arabic a workspace the reader holds read only, and nobody to list, read in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	const first = dialog({ rows: [{ ...rows[1], givable: false }] }, 'rtl');

	expect(dimmed(inSwitch('sami'))).toBe(true);
	expect(reasons()).toEqual([ar.organization.workspaceSwitches.notHeld]);

	first.unmount();
	dialog({ rows: [] }, 'rtl');

	expect(document.querySelector('[data-access-empty]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.noMemberToGrant
	);
	expect(ar.organization.dashboard.noMemberToGrant).not.toBe(
		en.organization.dashboard.noMemberToGrant
	);

	setLocale('en');
});
