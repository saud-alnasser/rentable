import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import MemberSheet from '$lib/organization/component/member-sheet.svelte';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import { fakeOrganizationRoles } from '$lib/platform/tests/testing';
import { BUILT_IN, maskOf } from '@rentable/workspace-permission';

/**
 * ONE MEMBER, ON ONE SURFACE
 *
 * Criterion 23 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] and
 * requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] from the sheet's
 * own side: the name, the role in the tray, what the member may do flag by flag, and the
 * workspaces, with one save that hands the four back together.
 *
 * **What the member may do is three columns**: what their role gives, what is changed for them
 * alone, and what they end up with. A flag the override switches reads as the opposite of the
 * role, either way round.
 *
 * **A control the reader may not use says why**: a role at or above the reader's rank, a flag the
 * reader does not hold, or a section whose flag the reader lacks.
 *
 * The surface submits through the form's own submit, which this one can fire: it holds choices
 * between fixed values and declares no schema, so nothing here reaches SvelteKit's `applyAction`.
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

const sheet = (
	overrides: Partial<Parameters<typeof render<typeof MemberSheet>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		MemberSheet,
		{
			open: true,
			onOpenChange: noop,
			username: 'ada',
			roleId: 'member',
			override: 0,
			roles: fakeOrganizationRoles(),
			rows,
			// a manager reading: every flag but the owner's, at the manager's rank.
			readerRank: BUILT_IN.manager.rank,
			readerPermissions: BUILT_IN.manager.mask,
			canRename: false,
			canAssignRole: true,
			canOverride: true,
			canGrantWorkspace: true,
			canGrantReadOnly: true,
			isSaving: false,
			nameRefusal: null,
			roleRefusal: null,
			overrideRefusal: null,
			workspacesRefusal: null,
			onSave: noop,
			...overrides
		},
		inProvider(direction)
	);

const surface = () => document.querySelector('[data-slot=form-surface]');
const usernameInput = () => document.querySelector<HTMLInputElement>('input[name=username]');
const tray = (name: string) => document.querySelector(`[data-sheet-tray="${name}"]`);
const section = (name: string) => document.querySelector(`[data-sheet-section="${name}"]`);
const sections = () =>
	Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
		block.getAttribute('data-sheet-section')
	);

/** the one sentence Rust refuses a username outside the rules with, read off the source. */
const rustUsernameRules = () => {
	const source = readFileSync(
		// the runner's root is `apps/desktop`, and the crate sits beside `src` there.
		resolve(process.cwd(), 'tauri/src/organization/invite.rs'),
		'utf8'
	);
	const declared = /pub const USERNAME_RULES: &str = "([^"]+)";/.exec(source);

	if (!declared) throw new Error('invite.rs no longer declares USERNAME_RULES');

	return declared[1];
};

/** the segment of a workspace's access control a level is offered by. */
const levelItem = (id: string, level: string) =>
	document.querySelector<HTMLElement>(`#access-${id} [data-level="${level}"]`);

/** the role's chooser, and each role it offers once opened. */
const roleTrigger = () => document.querySelector<HTMLElement>('#member-role')!;
const roleOption = (id: string) =>
	document.querySelector<HTMLElement>(`[data-slot=select-item][data-role="${id}"]`);

/** what a flag's row says in each column: the role's value, whether it is changed, the result. */
const flagRow = (flag: string) => ({
	role: document.querySelector(`[data-override-role="${flag}"]`)?.textContent?.trim(),
	changed: document.querySelector(`#member-override-${flag}`)?.getAttribute('data-state'),
	result: document.querySelector(`[data-override-result="${flag}"]`)?.textContent?.trim()
});

const change = async (flag: string) => {
	await fireEvent.click(document.querySelector<HTMLElement>(`#member-override-${flag}`)!);
};

const submit = async () => {
	await fireEvent.submit(document.querySelector('form')!);
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

// criterion 23, and the human's second look: one surface, on the heavy weight, which is the panel
// anchored to the window's edge rather than the centred card.
test('the sheet is a heavy form surface: the role, what they may do and the workspaces', () => {
	sheet();

	expect(surface()?.className).toContain('h-full');
	expect(surface()?.className).not.toContain('rounded-3xl');
	expect(screen.getByText(toTitleCase(en.common.actions.edit))).toBeDefined();
	expect(
		screen.getByText(
			en.organization.dashboard.memberSheetDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
	expect(sections()).toEqual(['role', 'override', 'workspaces']);
});

// a tray on top and records below: the role is the tray's control, with who it is for under it,
// and the save stays in the surface's own footer.
test('it reads as a tray on top and lists below, the way a directory does', () => {
	sheet();

	expect(
		Array.from(document.querySelectorAll('[data-sheet-tray]')).map((bar) =>
			bar.getAttribute('data-sheet-tray')
		)
	).toEqual(['member-role-tray']);
	expect(tray('member-role-tray')?.contains(roleTrigger())).toBe(true);
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.dashboard.role);
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.roles.member.who);
	expect(roleTrigger().textContent?.trim()).toBe(en.layout.signIn.roleMember);

	expect(
		tray('member-role-tray')!.compareDocumentPosition(section('override')!) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();

	const save = screen.getByRole('button', { name: en.common.actions.save });

	expect(document.querySelector('[data-sheet-tray]')?.contains(save)).toBe(false);
});

// effort 838, requirements 5 and 7: the chooser offers the organization's roles below the owner,
// highest first, and draws a role at or above the reader's own rank refused, saying why.
test('the role chooser offers every role but the owner, and refuses one not below the reader', async () => {
	sheet();

	await openSelect(roleTrigger());

	const offered = Array.from(document.querySelectorAll('[data-slot=select-item]')).map((item) =>
		item.getAttribute('data-role')
	);

	expect(offered).toEqual(['manager', 'supervisor', 'collector', 'member']);
	// the manager reading: the manager's own role is at their rank, not below it.
	expect(roleOption('manager')?.hasAttribute('data-disabled')).toBe(true);
	expect(roleOption('supervisor')?.hasAttribute('data-disabled')).toBe(false);
	// and the tray says why, inside it and under the control, where every reader can read it.
	expect(
		section('role')?.querySelector('[data-sheet-tray] [data-role-refusal]')?.textContent?.trim()
	).toBe(en.organization.dashboard.roleOutOfReach);
});

// requirement 12: role, override and result, flag by flag, for a flag the override flips each
// way. The member role carries editing a payment and not deleting one.
test('a flag the override switches reads as the opposite of the role, either way round', async () => {
	sheet({ override: maskOf('editPayment') });

	// the role gives editing, the override takes it away: changed, and the member may not.
	expect(flagRow('editPayment')).toEqual({
		role: en.organization.override.yes,
		changed: 'checked',
		result: en.organization.override.no
	});

	// the role does not give deleting; nothing changed yet, so neither may they.
	expect(flagRow('deletePayment')).toEqual({
		role: en.organization.override.no,
		changed: 'unchecked',
		result: en.organization.override.no
	});

	await change('deletePayment');

	// the override gives it them: changed, and now they may.
	expect(flagRow('deletePayment')).toEqual({
		role: en.organization.override.no,
		changed: 'checked',
		result: en.organization.override.yes
	});

	// every flag is grouped under its family, and the owner's own family is not offered.
	expect(
		Array.from(document.querySelectorAll('[data-override-family]')).map((table) =>
			table.getAttribute('data-override-family')
		)
	).toEqual(['administration', 'complex', 'unit', 'tenant', 'contract', 'payment']);
	expect(document.querySelector('[data-override-flag="lockOut"]')).toBeNull();
});

// requirement 6 and the spec's risk: picking another role keeps the override, and the result is
// read against the new role at once.
test('picking another role keeps the override and reads the result against the new role', async () => {
	const saved: { roleId: string; override: number }[] = [];

	sheet({ override: maskOf('editPayment'), onSave: (edit) => saved.push(edit) });

	await openSelect(roleTrigger());
	await chooseOption(roleOption('supervisor')!);

	expect(roleTrigger().textContent?.trim()).toBe('supervisor');
	// a role the organization made has no who-line of its own.
	expect(tray('member-role-tray')?.querySelector('[data-role-who]')).toBeNull();
	expect(flagRow('editPayment').changed).toBe('checked');

	await submit();

	expect(saved.map(({ roleId, override }) => ({ roleId, override }))).toEqual([
		{ roleId: 'supervisor', override: maskOf('editPayment') }
	]);
});

// requirement 7: a flag the reader does not hold is theirs neither to give nor to take, so its box
// is refused with the reason on its row.
test('a flag the reader does not hold is refused on its row, saying so', () => {
	sheet({ readerPermissions: BUILT_IN.manager.mask - maskOf('deletePayment') });

	const box = document.querySelector<HTMLElement>('#member-override-deletePayment')!;

	expect(box.hasAttribute('disabled')).toBe(true);
	expect(
		document.querySelector('[data-override-reason="deletePayment"]')?.textContent?.trim()
	).toBe(en.organization.dashboard.notHeld);
	expect(box.getAttribute('aria-describedby')).toBe('member-override-deletePayment-reason');
	// a flag they do hold is theirs.
	expect(document.querySelector('#member-override-editPayment')?.hasAttribute('disabled')).toBe(
		false
	);
});

// the flag: a reader without assignRole reads the role and may not change it, and one without
// overrideMember reads the three columns and may change none of them. Each says which flag.
test('a section whose flag the reader lacks is drawn, refused, naming the flag', () => {
	sheet({ canAssignRole: false, canOverride: false });

	expect(
		section('role')?.querySelector('[data-sheet-tray] [data-role-refusal]')?.textContent?.trim()
	).toBe(
		en.organization.dashboard.lacksFlag.replace('{flag:string}', en.organization.flags.assignRole)
	);
	expect(roleTrigger().hasAttribute('disabled')).toBe(true);
	expect(document.querySelector('[data-override-refusal]')?.textContent?.trim()).toBe(
		en.organization.dashboard.lacksFlag.replace(
			'{flag:string}',
			en.organization.flags.overrideMember
		)
	);
	expect(
		Array.from(document.querySelectorAll('[data-override-change]')).every((box) =>
			box.hasAttribute('disabled')
		)
	).toBe(true);
	// the facts are still there to read.
	expect(flagRow('viewComplex').result).toBe(en.organization.override.yes);
});

// criterion 23: one row per workspace, the level named and said, and the fullest first.
test('the workspaces are one row each, with a named level and its sentence', async () => {
	sheet();

	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ws-1', 'ws-2']);
	expect(screen.getByText('Riyadh')).toBeDefined();
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.levels.full.does
	);
	expect(
		within(document.querySelector<HTMLElement>('#access-ws-1')!)
			.getAllByRole('radio')
			.map((segment) => segment.getAttribute('data-level'))
	).toEqual(['full-access', 'read-only', 'none']);

	await fireEvent.click(levelItem('ws-1', 'read-only')!);
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.levels.readOnly.does
	);
});

// one save, and the acts it runs handed back together; the workspaces only where they changed.
test('one save hands back the role, the override and the workspaces that changed', async () => {
	const saved: unknown[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(levelItem('ws-2', 'full-access')!);
	await change('deletePayment');
	await submit();

	expect(saved).toEqual([
		{
			username: 'ada',
			roleId: 'member',
			override: maskOf('deletePayment'),
			changes: [{ id: 'ws-2', access: 'full-access' }]
		}
	]);
});

// [[rules/interface]], *Validation errors*: a refusal marks the section that asked for it.
test('a refusal marks its own section', () => {
	sheet({
		roleRefusal: 'that role is not below your own',
		overrideRefusal: 'you do not hold this',
		workspacesRefusal: 'no workspace by that name'
	});

	expect(section('role')?.querySelector('[data-sheet-error="role"]')?.textContent?.trim()).toBe(
		'that role is not below your own'
	);
	expect(
		section('override')?.querySelector('[data-sheet-error="override"]')?.textContent?.trim()
	).toBe('you do not hold this');
	expect(
		section('workspaces')?.querySelector('[data-sheet-error="workspaces"]')?.textContent?.trim()
	).toBe('no workspace by that name');
});

// effort 832, requirement 6: the name is the sheet's first section, drawn by renameMember alone,
// and the workspaces by grantWorkspace alone.
test('the name is the first section, drawn by renameMember and opened on the name they hold', () => {
	const renaming = sheet({ canRename: true });

	expect(sections()).toEqual(['name', 'role', 'override', 'workspaces']);
	expect(usernameInput()?.value).toBe('ada');
	renaming.unmount();

	sheet({ canRename: true, canGrantWorkspace: false });

	expect(sections()).toEqual(['name', 'role', 'override']);
});

test('one save hands back the new name, trimmed', async () => {
	const saved: { username: string }[] = [];

	sheet({ canRename: true, onSave: (edit) => saved.push(edit) });

	await fireEvent.input(usernameInput()!, { target: { value: '  ada.l  ' } });
	await submit();

	expect(saved.map((edit) => edit.username)).toEqual(['ada.l']);
});

// criterion 23 of effort 824: a username outside the rules is refused on the field with the one
// sentence, and the sentence is Rust's own. Nothing is handed back while it stands.
test('a username outside the rules is refused with the sentence rust refuses it with', async () => {
	const saved: unknown[] = [];

	sheet({ canRename: true, onSave: (edit) => saved.push(edit) });

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'ad' } });
	await fireEvent.focusOut(input);

	expect(section('name')?.querySelector('[data-sheet-error="name"]')?.textContent?.trim()).toBe(
		en.organization.dashboard.usernameRules
	);
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());

	await submit();

	expect(saved).toEqual([]);
});

test('a refused rename marks the name', () => {
	sheet({ canRename: true, nameRefusal: 'that username is taken' });

	expect(section('name')?.querySelector('[data-sheet-error="name"]')?.textContent?.trim()).toBe(
		'that username is taken'
	);
	expect(usernameInput()?.getAttribute('aria-invalid')).toBe('true');
});

test('a closed sheet puts nothing in the document', () => {
	sheet({ open: false });

	expect(surface()).toBeNull();
});

test('and in arabic every sentence reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({}, 'rtl');

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.override.legend)).toBeDefined();
	expect(ar.organization.override.legend).not.toBe(en.organization.override.legend);
	expect(tray('member-role-tray')?.textContent).toContain(ar.organization.roles.member.who);
	expect(roleTrigger().textContent?.trim()).toBe(ar.layout.signIn.roleMember);

	setLocale('en');
});
