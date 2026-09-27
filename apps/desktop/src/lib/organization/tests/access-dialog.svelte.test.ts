import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccessDialog from '$lib/organization/component/access-dialog.svelte';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * A WORKSPACE'S PEOPLE, RENDERED
 *
 * The dialog a workspace's card opens: every member who could hold it, each a switch, in or out,
 * with the owner's lock to read only beneath one who is in (effort 838, requirement 12 as amended
 * again; ticket 49). It is the member's card read from the other end, drawn from the same list
 * (`access-switches.svelte`), so the refusals and their reasons are the card's: the lock for
 * anybody but the owner, and putting somebody in a workspace the reader holds read only.
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
	{ id: 'ada', name: 'ada', access: 'full-access' as const, givable: true },
	{ id: 'sami', name: 'sami', access: 'none' as const, givable: true }
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
const inSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}`);
const lockSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}-lock`);
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
	// the lock stands beneath the member who is in, and only there, saying what it is.
	expect(lockSwitch('ada')?.getAttribute('data-size')).toBe('sm');
	expect(checked(lockSwitch('ada'))).toBe(false);
	expect(lockSwitch('sami')).toBeNull();
	expect(document.querySelector('[data-access-says="ada"]')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.locked
	);
	expect(lockSwitch('ada')?.getAttribute('aria-label')).toBe(
		en.organization.workspaceSwitches.lockMemberNamed.replace('{member:string}', 'ada')
	);
	// no level is offered: no segment, and none of the words a level went by.
	expect(document.querySelector('[data-slot=toggle-group-item]')).toBeNull();
	expect(document.querySelector('[role=radio]')).toBeNull();
	expect(surface()?.textContent).not.toContain(en.organization.dashboard.accessFull);
	expect(surface()?.textContent).not.toContain('no access');
	// the owner reading, so nothing is dimmed and no reason is said.
	expect(reasons()).toEqual([]);
});

// in: switching a member on is a full-access grant, and the lock appears beneath them.
test('switching a member on puts them in at full access, and only that comes back', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(inSwitch('sami')!);

	expect(checked(inSwitch('sami'))).toBe(true);
	expect(lockSwitch('sami')).not.toBeNull();

	await submit();

	// the row that was left alone is not a change, so nothing is written on it.
	expect(saved).toEqual([[{ id: 'sami', access: 'full-access' }]]);
});

// out: switching a member off withdraws the grant, and the lock goes with it.
test('switching a member off takes them out', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(inSwitch('ada')!);

	expect(checked(inSwitch('ada'))).toBe(false);
	expect(lockSwitch('ada')).toBeNull();

	await submit();

	expect(saved).toEqual([[{ id: 'ada', access: 'none' }]]);
});

// lock: the owner locks a member to read only, which grants the workspace again read only.
test('locking a member grants them the workspace read only', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({ onSave: (changes) => saved.push(changes) });

	await fireEvent.click(lockSwitch('ada')!);

	expect(checked(lockSwitch('ada'))).toBe(true);
	expect(checked(inSwitch('ada'))).toBe(true);

	await submit();

	expect(saved).toEqual([[{ id: 'ada', access: 'read-only' }]]);
});

// unlock: a member held read only, unlocked, is granted full access again. Switched off and on
// again, they are back to what they held, and nothing is written.
test('unlocking grants full access again, and off and on again changes nothing', async () => {
	const saved: { id: string; access: string }[][] = [];
	const locked = [{ id: 'ada', name: 'ada', access: 'read-only' as const, givable: true }];

	const first = dialog({ rows: locked, onSave: (changes) => saved.push(changes) });

	expect(checked(lockSwitch('ada'))).toBe(true);

	await fireEvent.click(lockSwitch('ada')!);
	expect(checked(lockSwitch('ada'))).toBe(false);
	await submit();

	first.unmount();
	dialog({ rows: locked, onSave: (changes) => saved.push(changes) });

	await fireEvent.click(inSwitch('ada')!);
	await fireEvent.click(inSwitch('ada')!);
	expect(checked(lockSwitch('ada'))).toBe(true);
	await submit();

	expect(saved).toEqual([[{ id: 'ada', access: 'full-access' }], []]);
});

// requirement 5 of effort 826: only the owner's Turso account mints a read-only credential, so for
// anybody else the lock is drawn dimmed with the reason, never hidden, and a lock already on
// stays on.
test('for anybody but the owner the lock is dimmed and says why', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		canGrantReadOnly: false,
		rows: [
			{ id: 'ada', name: 'ada', access: 'full-access' as const, givable: true },
			{ id: 'sami', name: 'sami', access: 'read-only' as const, givable: true }
		],
		onSave: (changes) => saved.push(changes)
	});

	const reason = en.organization.workspaceSwitches.lockIsTheOwners;

	expect(dimmed(lockSwitch('ada'))).toBe(true);
	expect(dimmed(lockSwitch('sami'))).toBe(true);
	expect(checked(lockSwitch('sami'))).toBe(true);
	expect(document.querySelector('#access-ada-lock-reason')?.textContent?.trim()).toBe(reason);
	expect(reasons()).toEqual([reason]);
	// the member themselves is still the reader's to switch.
	expect(dimmed(inSwitch('ada'))).toBe(false);

	await fireEvent.click(lockSwitch('ada')!);
	await fireEvent.click(lockSwitch('sami')!);

	expect(checked(lockSwitch('ada'))).toBe(false);
	expect(checked(lockSwitch('sami'))).toBe(true);

	await submit();

	expect(saved).toEqual([[]]);
});

// a granter gives only what they reach: full access is their own credential re-sealed, so where
// the reader holds this workspace read only, nobody can be put in. Taking somebody out is still
// theirs, since a withdrawal re-seals nothing.
test('a workspace the reader holds read only puts nobody in, and still withdraws', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		canGrantReadOnly: false,
		rows: [
			{ id: 'ada', name: 'ada', access: 'full-access' as const, givable: false },
			{ id: 'sami', name: 'sami', access: 'none' as const, givable: false }
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
		canGrantReadOnly: false,
		rows: [{ id: 'ada', name: 'ada', access: 'full-access' as const, givable: false }],
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

// the owner on a machine without the Turso authority: Rust refuses a read-only grant there, so
// the lock is dimmed with the sentence that says this machine is not connected, not the owner's.
test('for the owner on a machine without the Turso authority the lock says so', async () => {
	const saved: { id: string; access: string }[][] = [];

	dialog({
		canGrantReadOnly: false,
		readerIsOwner: true,
		onSave: (changes) => saved.push(changes)
	});

	const reason = en.common.refusals.host.tursoNotConnected;

	expect(dimmed(lockSwitch('ada'))).toBe(true);
	expect(document.querySelector('#access-ada-lock-reason')?.textContent?.trim()).toBe(reason);
	expect(reasons()).toEqual([reason]);

	await fireEvent.click(lockSwitch('ada')!);
	expect(checked(lockSwitch('ada'))).toBe(false);

	await submit();

	expect(saved).toEqual([[]]);
});

// the lock's line says what locking does, and is read with the lock, beside any reason it is
// refused for.
test('the lock is described by what locking does, and by its reason where it has one', () => {
	const first = dialog();

	expect(document.querySelector('#access-ada-lock-says')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.locked
	);
	expect(lockSwitch('ada')?.getAttribute('aria-describedby')).toBe('access-ada-lock-says');

	first.unmount();
	dialog({ canGrantReadOnly: false });

	expect(lockSwitch('ada')?.getAttribute('aria-describedby')).toBe(
		'access-ada-lock-says access-ada-lock-reason'
	);
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

test('and in arabic the lock and its reason read in their own words, right to left', () => {
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
	expect(document.querySelector('[data-access-says="ada"]')?.textContent?.trim()).toBe(
		ar.organization.workspaceSwitches.locked
	);
	expect(lockSwitch('ada')?.getAttribute('aria-label')).toBe(
		ar.organization.workspaceSwitches.lockMemberNamed.replace('{member}', 'ada')
	);
	expect(dimmed(lockSwitch('ada'))).toBe(true);
	expect(reasons()).toEqual([ar.organization.workspaceSwitches.lockIsTheOwners]);
	expect(ar.organization.workspaceSwitches.lockIsTheOwners).not.toBe(
		en.organization.workspaceSwitches.lockIsTheOwners
	);

	setLocale('en');
});

test('and in arabic a workspace the reader holds read only says so at the switch', () => {
	loadLocale('ar');
	setLocale('ar');
	dialog({ rows: [{ id: 'sami', name: 'sami', access: 'none' as const, givable: false }] }, 'rtl');

	expect(dimmed(inSwitch('sami'))).toBe(true);
	expect(reasons()).toEqual([ar.organization.workspaceSwitches.notHeld]);

	setLocale('en');
});

test('and in arabic the owner without the Turso authority, and nobody to list, read in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	const first = dialog({ canGrantReadOnly: false, readerIsOwner: true }, 'rtl');

	expect(reasons()).toEqual([ar.common.refusals.host.tursoNotConnected]);
	expect(ar.common.refusals.host.tursoNotConnected).not.toBe(
		en.common.refusals.host.tursoNotConnected
	);

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
