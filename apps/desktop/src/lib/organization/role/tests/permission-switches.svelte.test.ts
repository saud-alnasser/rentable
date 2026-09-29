import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

// the glyph each kind of record's group wears is its surface's, provided as the surfaces are
// composed, as the frame does by importing them (`glyphOf` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import PermissionSwitches from '$lib/organization/role/component/permission-switches.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { BUILT_IN, FAMILIES, maskOf, permits } from '@rentable/workspace-permission';

import Providers from '#tests/providers.svelte';
import { unfold } from '$lib/organization/tests/switches';

/**
 * ONE LIST OF SWITCHES, FOR A ROLE AND FOR A MEMBER
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended
 * 2026-09-27 and a fourth time 2026-09-28, from the list's own side: each kind of record and the
 * organization a group that folds to how many of its permissions are on, and opens to one row per
 * permission with its glyph, its name, a line of what it allows and its switch; adding, editing
 * and deleting refused while viewing is off; the owner's acts a line; a switch the reader may not
 * turn dimmed, saying why, and its folded group saying so; and, compared against a role, each
 * switch that differs marked, and its folded group too. The role editor and a member's card draw
 * this; `roles.svelte.test.ts` and `member-sheet.svelte.test.ts` read it from theirs.
 *
 * The list is rendered with a mask and hands the next one up through `onChange`, which the test
 * feeds back, the way both surfaces hold it.
 */

type Props = Parameters<typeof render<typeof PermissionSwitches>>[1];

const list = (overrides: Partial<Props> = {}, direction: 'ltr' | 'rtl' = 'ltr') => {
	const handed: number[] = [];
	const props = {
		id: 'role-flag',
		mask: BUILT_IN.member.mask,
		held: BUILT_IN.manager.mask,
		disabled: false,
		onChange: (mask: number) => {
			handed.push(mask);
			view.rerender({ mask });
		},
		...overrides
	};
	const view = render(PermissionSwitches, props, {
		wrapper: Providers,
		wrapperProps: { strings, direction }
	});

	return handed;
};

const control = (flag: string) => document.querySelector<HTMLElement>(`#role-flag-${flag}`);
const isOn = (flag: string) => control(flag)?.getAttribute('aria-checked') === 'true';
const groups = () =>
	Array.from(document.querySelectorAll('[data-switches-group]')).map((group) =>
		group.getAttribute('data-switches-group')
	);
const rows = (family: string) => document.querySelector(`[data-switches-rows="${family}"]`);
const fold = (family: string) =>
	document.querySelector<HTMLElement>(`[data-switches-fold="${family}"]`)!;
const summary = (family: string) =>
	document.querySelector(`[data-switches-summary="${family}"]`)?.textContent?.trim();
const labels = (family: string) =>
	Array.from(rows(family)!.querySelectorAll('label')).map((label) => label.textContent?.trim());
const says = (flag: string) =>
	document.querySelector(`[data-switch-says="${flag}"]`)?.textContent?.trim();

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('every group folds to its glyph, its name and how many are on, and opens from its head', async () => {
	list();

	expect(groups()).toEqual(['complex', 'unit', 'tenant', 'contract', 'payment', 'administration']);

	const complexes = document.querySelector('[data-switches-group="complex"]')!;

	// folded: the head alone, a button saying whether it is open, with no switch drawn.
	expect(complexes.querySelector('svg')).not.toBeNull();
	expect(fold('complex').tagName).toBe('BUTTON');
	expect(fold('complex').textContent).toContain(en.organization.families.complex);
	expect(fold('complex').getAttribute('aria-expanded')).toBe('false');
	for (const kind of ['complex', 'unit', 'tenant', 'contract', 'payment'] as const) {
		const on = FAMILIES[kind].filter((flag) => permits(BUILT_IN.member.mask, flag)).length;

		expect(summary(kind)).toBe(`${on} of 4`);
	}
	expect(summary('administration')).toBe('0 of 10');
	expect(document.querySelector('[data-switch]')).toBeNull();

	await fireEvent.click(fold('complex'));

	expect(fold('complex').getAttribute('aria-expanded')).toBe('true');
	// the other groups stay folded.
	expect(fold('unit').getAttribute('aria-expanded')).toBe('false');
	expect(rows('unit')).toBeNull();

	// opened: a row per permission, its glyph, its name, and a line of what it allows.
	expect(labels('complex')).toEqual([
		en.organization.flagVerbs.view,
		en.organization.flagVerbs.create,
		en.organization.flagVerbs.edit,
		en.organization.flagVerbs.delete
	]);
	for (const flag of FAMILIES.complex) {
		expect(
			document.querySelector(`[data-switch-row="${flag}"] svg[aria-hidden="true"]`)
		).not.toBeNull();
	}
	expect(says('viewComplex')).toBe(en.organization.switches.verbSays.view);
	expect(says('deleteComplex')).toBe(en.organization.switches.verbSays.delete);
	// a row's glyph is its verb's: the eye is not the plus.
	expect(
		document.querySelector('[data-switch-row="viewComplex"] svg')?.getAttribute('class')
	).not.toBe(
		document.querySelector('[data-switch-row="createComplex"] svg')?.getAttribute('class')
	);

	// each switch is named whole, and described by its line.
	expect(control('viewComplex')?.getAttribute('role')).toBe('switch');
	expect(control('viewComplex')?.getAttribute('aria-label')).toBe(
		`${en.organization.flagVerbs.view} ${en.organization.families.complex}`
	);
	expect(control('createComplex')?.getAttribute('aria-describedby')).toBe(
		'role-flag-createComplex-says'
	);
	// the words themselves, and not only the keys: a create flag reads *add*, while the
	// application's own create action, which every create form submits with, still reads create.
	expect(en.organization.flagVerbs.create).toBe('add');
	expect(en.common.actions.create).toBe('create');

	// pressed again, it folds.
	await fireEvent.click(fold('complex'));

	expect(rows('complex')).toBeNull();
});

test('editing a contract says it covers ending, renewing and restoring', async () => {
	list();
	await unfold('contract');

	expect(says('editContract')).toBe(en.organization.switches.flagSays.editContract);
	expect(says('viewContract')).toBe(en.organization.switches.verbSays.view);
});

test('adding, editing and deleting are refused while viewing is off, and turn off with it', async () => {
	const handed = list();

	await unfold('tenant');

	expect(isOn('createTenant')).toBe(true);

	await fireEvent.click(control('viewTenant')!);

	expect(handed.at(-1)).toBe(
		BUILT_IN.member.mask - maskOf('viewTenant', 'createTenant', 'editTenant')
	);
	expect(summary('tenant')).toBe('0 of 4');

	// still drawn, off, and refused, saying why.
	const add = control('createTenant')!;

	expect(isOn('createTenant')).toBe(false);
	expect(add.getAttribute('aria-disabled')).toBe('true');
	expect(document.querySelector('#role-flag-createTenant-reason')?.textContent?.trim()).toBe(
		en.organization.switches.viewFirst
	);

	await fireEvent.click(add);

	expect(handed).toHaveLength(1);
	// the view's own refusal is the reader's to lift, so the head carries no lock.
	expect(document.querySelector('[data-switches-refused]')).toBeNull();

	// turned back on, view alone comes back, and its writes are the reader's to turn again.
	await fireEvent.click(control('viewTenant')!);

	expect(isOn('viewTenant')).toBe(true);
	expect(isOn('createTenant')).toBe(false);
	expect(control('createTenant')?.hasAttribute('aria-disabled')).toBe(false);

	// a write turned on is only that write.
	await fireEvent.click(control('deleteTenant')!);

	expect(handed.at(-1)).toBe(
		BUILT_IN.member.mask - maskOf('createTenant', 'editTenant') + maskOf('deleteTenant')
	);
});

// a mask stored before a write needed its view: nothing live is hidden, so it can be turned off.
test('a write carried without its view can be seen and turned off', async () => {
	const handed = list({ mask: maskOf('editPayment') });

	await unfold('payment');

	expect(isOn('viewPayment')).toBe(false);
	expect(isOn('editPayment')).toBe(true);
	expect(control('editPayment')?.hasAttribute('aria-disabled')).toBe(false);

	await fireEvent.click(control('editPayment')!);

	expect(handed.at(-1)).toBe(0);
});

test("the organization's ten each say what they allow, and turn", async () => {
	const handed = list({
		mask: maskOf('inviteMember', 'removeMember', 'manageRoles', 'manageMark')
	});

	expect(summary('administration')).toBe('4 of 10');
	expect(control('inviteMember')).toBeNull();

	await unfold('administration');

	expect(fold('administration').getAttribute('aria-expanded')).toBe('true');
	expect(labels('administration')).toEqual([
		en.organization.flags.inviteMember,
		en.organization.flags.removeMember,
		en.organization.flags.assignRole,
		en.organization.flags.renameWorkspace,
		en.organization.flags.resetPassword,
		en.organization.flags.renameMember,
		en.organization.flags.grantWorkspace,
		en.organization.flags.manageRoles,
		en.organization.flags.overrideMember,
		en.organization.flags.manageMark
	]);

	for (const flag of FAMILIES.administration) {
		expect(says(flag)).toBe(en.organization.switches.flagSays[flag]);
		expect(document.querySelector(`[data-switch-row="${flag}"] svg`)).not.toBeNull();
	}

	// ten glyphs, none of them another's.
	const glyphs = FAMILIES.administration.map((flag) =>
		document.querySelector(`[data-switch-row="${flag}"] svg`)?.getAttribute('class')
	);

	expect(new Set(glyphs).size).toBe(10);

	await fireEvent.click(control('assignRole')!);

	expect(handed.at(-1)).toBe(
		maskOf('inviteMember', 'removeMember', 'assignRole', 'manageRoles', 'manageMark')
	);
	expect(summary('administration')).toBe('5 of 10');
});

test("the owner's own acts are one line under the crown, and no switch", async () => {
	list();
	await unfold();

	const owner = document.querySelector('[data-switches-owner]')!;

	expect(owner.textContent?.trim()).toBe(en.organization.switches.owner);
	expect(owner.querySelector('svg')).not.toBeNull();

	for (const flag of FAMILIES.owner) {
		expect(control(flag)).toBeNull();
	}
});

// requirement 7: a switch the reader does not hold is theirs neither to give nor to take.
test('a switch the reader does not hold is dimmed, says why, and does not turn', async () => {
	const handed = list({ held: BUILT_IN.manager.mask - maskOf('deleteUnit') });

	// folded, the group says one inside is not the reader's; the others say nothing.
	expect(document.querySelector('[data-switches-refused="unit"]')?.getAttribute('aria-label')).toBe(
		en.organization.switches.groupRefused
	);
	expect(document.querySelectorAll('[data-switches-refused]')).toHaveLength(1);

	await unfold('unit');

	const refused = control('deleteUnit')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('disabled')).toBe(false);
	expect(refused.getAttribute('data-unavailable')).toBe('');
	expect(document.querySelector('#role-flag-deleteUnit-reason')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);
	// once, above the list, for every dimmed switch.
	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);

	await fireEvent.click(refused);
	await fireEvent.keyDown(refused, { key: ' ' });

	expect(handed).toEqual([]);
	expect(isOn('deleteUnit')).toBe(false);
});

// turning a view off turns off the writes beneath it, and one of them may not be the reader's.
test('a view whose writes include one the reader does not hold is refused, saying so', async () => {
	const handed = list({
		mask: BUILT_IN.manager.mask,
		held: BUILT_IN.manager.mask - maskOf('deleteContract')
	});

	await unfold();

	expect(control('viewContract')?.getAttribute('aria-disabled')).toBe('true');
	expect(document.querySelector('#role-flag-viewContract-reason')?.textContent?.trim()).toBe(
		en.organization.switches.writesNotHeld
	);

	await fireEvent.click(control('viewContract')!);

	expect(handed).toEqual([]);
	// another kind's view is the reader's to turn.
	expect(control('viewPayment')?.hasAttribute('aria-disabled')).toBe(false);
});

test('where the reader may turn none of them, every switch is dimmed and the list says why', async () => {
	list({ refusal: 'this is you.' });

	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		'this is you.'
	);
	expect(document.querySelectorAll('[data-switches-refused]')).toHaveLength(6);

	await unfold();

	expect(
		Array.from(document.querySelectorAll('[data-switch]')).every(
			(each) => each.getAttribute('aria-disabled') === 'true'
		)
	).toBe(true);
});

test('nothing dimmed, nothing said', async () => {
	list({ held: BUILT_IN.manager.mask });

	await unfold();

	expect(document.querySelector('[data-switches-refusal]')).toBeNull();
	expect(document.querySelector('[data-switches-refused]')).toBeNull();
	// the only switches dimmed are the writes of a kind the member cannot view.
	expect(
		Array.from(document.querySelectorAll('[data-unavailable-reason]'))
			.map((reason) => reason.textContent?.trim())
			.filter(Boolean)
			.every((reason) => reason === en.organization.switches.viewFirst)
	).toBe(true);
});

// compared against a role, a switch that differs carries a dot naming it, and a folded group
// whose switches differ carries it on its head.
test('against a role, each switch that differs is marked, and its folded group too', async () => {
	list({
		mask: BUILT_IN.member.mask - maskOf('editUnit') + maskOf('inviteMember'),
		baseline: { mask: BUILT_IN.member.mask, name: 'member' }
	});

	const marked = () =>
		Array.from(document.querySelectorAll('[data-differs]')).map((mark) =>
			mark.getAttribute('data-differs')
		);

	expect(marked()).toEqual(['unit', 'administration']);
	expect(document.querySelector('[data-differs="unit"]')?.getAttribute('aria-label')).toBe(
		en.organization.switches.differs.replace('{role:string}', 'member')
	);

	await unfold('unit');

	expect(marked()).toEqual(['unit', 'editUnit', 'administration']);
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('aria-label')).toBe(
		en.organization.switches.differs.replace('{role:string}', 'member')
	);
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('role')).toBe('img');
	expect(control('editUnit')?.getAttribute('aria-describedby')).toContain(
		'role-flag-editUnit-differs'
	);
});

test('without a role to compare against, nothing is marked', async () => {
	list({ mask: maskOf('viewUnit') });
	await unfold();

	expect(document.querySelector('[data-differs]')).toBeNull();
});

test('and in arabic the list reads in its own words, and its thumbs run right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	list({ baseline: { mask: BUILT_IN.member.mask - maskOf('editUnit'), name: 'محصّل' } }, 'rtl');

	expect(fold('unit').textContent).toContain(ar.organization.families.unit);
	expect(summary('administration')).toBe('0 من 10');

	await unfold();

	expect(control('createUnit')?.getAttribute('aria-label')).toBe(
		`${ar.organization.flagVerbs.create} ${ar.organization.families.unit}`
	);
	expect(says('createUnit')).toBe(ar.organization.switches.verbSays.create);
	expect(says('manageMark')).toBe(ar.organization.switches.flagSays.manageMark);
	expect(document.querySelector('[data-switches-owner]')?.textContent?.trim()).toBe(
		ar.organization.switches.owner
	);
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('aria-label')).toBe(
		ar.organization.switches.differs.replace('{role}', 'محصّل')
	);
	expect(document.querySelector('[data-slot="switch-thumb"]')?.className).toContain(
		'rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]'
	);

	setLocale('en');
});
