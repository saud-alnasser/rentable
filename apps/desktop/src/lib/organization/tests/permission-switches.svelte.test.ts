import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import PermissionSwitches from '$lib/organization/component/permission-switches.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { BUILT_IN, FAMILIES, maskOf } from '@rentable/workspace-permission';

import Providers from './providers.svelte';

/**
 * ONE LIST OF SWITCHES, FOR A ROLE AND FOR A MEMBER
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended
 * 2026-09-27, from the list's own side: each kind of record a group under its glyph with view as
 * its switch and add, edit and delete beneath it while view is on; the organization's ten folded to
 * a count; the owner's acts a line; a switch the reader may not turn dimmed, saying why; and,
 * compared against a role, each switch that differs marked. The role editor and a member's card
 * draw this; `roles.svelte.test.ts` and `member-sheet.svelte.test.ts` read it from theirs.
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
const writes = (kind: string) => document.querySelector(`[data-switches-writes="${kind}"]`);
const fold = () => document.querySelector<HTMLElement>('[data-switches-fold]')!;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('each kind of record is a group under its name, with view as its switch', () => {
	list();

	expect(groups()).toEqual(['complex', 'unit', 'tenant', 'contract', 'payment', 'administration']);

	const complexes = document.querySelector('[data-switches-group="complex"]')!;

	// the head: the kind's glyph and name, and the view switch, named whole since the head is not.
	expect(complexes.querySelector('svg')).not.toBeNull();
	expect(complexes.querySelector('label')?.textContent?.trim()).toBe(
		en.organization.families.complex
	);
	expect(control('viewComplex')?.getAttribute('role')).toBe('switch');
	expect(control('viewComplex')?.getAttribute('aria-label')).toBe(
		`${en.organization.switches.view} ${en.organization.families.complex}`
	);
	expect(control('viewComplex')?.getAttribute('data-size')).toBe('default');

	// beneath it, add, edit and delete as mini switches, each labelled by its verb.
	expect(
		Array.from(writes('complex')!.querySelectorAll('label')).map((label) =>
			label.textContent?.trim()
		)
	).toEqual([
		en.organization.switches.add,
		en.organization.switches.edit,
		en.organization.switches.delete
	]);
	expect(control('createComplex')?.getAttribute('data-size')).toBe('sm');
	expect(control('createComplex')?.getAttribute('aria-label')).toBe(
		`${en.organization.switches.add} ${en.organization.families.complex}`
	);
	// editing a contract covers ending, renewing and restoring it, and says so.
	expect(document.querySelector('[data-switch-says="editContract"]')?.textContent?.trim()).toBe(
		en.organization.switches.contractEdit
	);
});

test('add, edit and delete are drawn only while view is on, and turn off with it', async () => {
	const handed = list();

	expect(isOn('createTenant')).toBe(true);

	await fireEvent.click(control('viewTenant')!);

	expect(handed.at(-1)).toBe(
		BUILT_IN.member.mask - maskOf('viewTenant', 'createTenant', 'editTenant')
	);
	expect(writes('tenant')).toBeNull();
	expect(control('createTenant')).toBeNull();

	// turned back on, view alone comes back: nothing beneath it was kept on out of sight.
	await fireEvent.click(control('viewTenant')!);

	expect(writes('tenant')).not.toBeNull();
	expect(isOn('viewTenant')).toBe(true);
	expect(isOn('createTenant')).toBe(false);
	expect(isOn('editTenant')).toBe(false);

	// a write turned on is only that write.
	await fireEvent.click(control('deleteTenant')!);

	expect(handed.at(-1)).toBe(
		BUILT_IN.member.mask - maskOf('createTenant', 'editTenant') + maskOf('deleteTenant')
	);
});

// a mask stored before a write needed its view: nothing live is hidden, so it can be turned off.
test('a write carried without its view is still drawn, so it can be seen and turned off', () => {
	list({ mask: maskOf('editPayment') });

	expect(isOn('viewPayment')).toBe(false);
	expect(writes('payment')).not.toBeNull();
	expect(isOn('editPayment')).toBe(true);
	expect(writes('complex')).toBeNull();
});

test("the organization's ten fold to how many are on, and open to be changed", async () => {
	const handed = list({
		mask: maskOf('inviteMember', 'removeMember', 'manageRoles', 'manageMark')
	});

	expect(document.querySelector('[data-switches-summary]')?.textContent?.trim()).toBe('4 of 10');
	expect(fold().getAttribute('aria-expanded')).toBe('false');
	expect(control('inviteMember')).toBeNull();

	await fireEvent.click(fold());

	expect(fold().getAttribute('aria-expanded')).toBe('true');
	expect(
		Array.from(writes('administration')!.querySelectorAll('label')).map((label) =>
			label.textContent?.trim()
		)
	).toEqual([
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

	await fireEvent.click(control('assignRole')!);

	expect(handed.at(-1)).toBe(
		maskOf('inviteMember', 'removeMember', 'assignRole', 'manageRoles', 'manageMark')
	);
	expect(document.querySelector('[data-switches-summary]')?.textContent?.trim()).toBe('5 of 10');
});

test("the owner's own acts are one line under the crown, and no switch", () => {
	list();

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

	const refused = control('deleteUnit')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('disabled')).toBe(false);
	expect(refused.getAttribute('data-unavailable')).toBe('');
	expect(document.querySelector('#role-flag-deleteUnit-reason')?.textContent?.trim()).toBe(
		en.organization.dashboard.notHeld
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

	expect(control('viewContract')?.getAttribute('aria-disabled')).toBe('true');
	expect(document.querySelector('#role-flag-viewContract-reason')?.textContent?.trim()).toBe(
		en.organization.switches.writesNotHeld
	);

	await fireEvent.click(control('viewContract')!);

	expect(handed).toEqual([]);
	// another kind's view is the reader's to turn.
	expect(control('viewPayment')?.hasAttribute('aria-disabled')).toBe(false);
});

test('where the reader may turn none of them, every switch is dimmed and the list says why', () => {
	list({ refusal: 'this is you.' });

	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		'this is you.'
	);
	expect(
		Array.from(document.querySelectorAll('[data-switch]')).every(
			(each) => each.getAttribute('aria-disabled') === 'true'
		)
	).toBe(true);
});

test('nothing dimmed, nothing said', () => {
	list({ held: BUILT_IN.manager.mask });

	expect(document.querySelector('[data-switches-refusal]')).toBeNull();
	expect(document.querySelector('[data-unavailable]')).toBeNull();
});

// compared against a role, a switch that differs carries a dot naming it, and a folded group
// whose switches differ carries it on its head.
test('against a role, each switch that differs is marked, and a folded group with one too', () => {
	list({
		mask: BUILT_IN.member.mask - maskOf('editUnit') + maskOf('inviteMember'),
		baseline: { mask: BUILT_IN.member.mask, name: 'member' }
	});

	const marked = Array.from(document.querySelectorAll('[data-differs]')).map((mark) =>
		mark.getAttribute('data-differs')
	);

	expect(marked).toEqual(['editUnit', 'administration']);
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('aria-label')).toBe(
		en.organization.switches.differs.replace('{role:string}', 'member')
	);
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('role')).toBe('img');
});

test('without a role to compare against, nothing is marked', () => {
	list({ mask: maskOf('viewUnit') });

	expect(document.querySelector('[data-differs]')).toBeNull();
});

test('and in arabic the list reads in its own words, and its thumbs run right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	list({ baseline: { mask: BUILT_IN.member.mask - maskOf('editUnit'), name: 'محصّل' } }, 'rtl');

	expect(document.querySelector('[data-switches-group="unit"] label')?.textContent?.trim()).toBe(
		ar.organization.families.unit
	);
	expect(control('createUnit')?.getAttribute('aria-label')).toBe(
		`${ar.organization.switches.add} ${ar.organization.families.unit}`
	);
	expect(document.querySelector('[data-switches-owner]')?.textContent?.trim()).toBe(
		ar.organization.switches.owner
	);
	expect(document.querySelector('[data-switches-summary]')?.textContent?.trim()).toBe('0 من 10');
	expect(document.querySelector('[data-differs="editUnit"]')?.getAttribute('aria-label')).toBe(
		ar.organization.switches.differs.replace('{role}', 'محصّل')
	);
	expect(document.querySelector('[data-slot="switch-thumb"]')?.className).toContain(
		'rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]'
	);

	setLocale('en');
});
