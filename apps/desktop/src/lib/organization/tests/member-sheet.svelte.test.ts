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
import { EVERY_ADMINISTRATION, maskOf, permits } from '@rentable/workspace-permission';

/**
 * ONE MEMBER, ON ONE SURFACE
 *
 * Criterion 23 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] from
 * the sheet's own side: three sections, a sentence per role, a sentence per act, a chooser that
 * adds one act at a time, the three levels each with a sentence, and one save that hands the
 * three acts back together. *It was a role dialog of seven checkboxes and an access dialog of
 * workspace rows, and the human asked for one surface.*
 *
 * **It reads as a directory**: a tray on top carrying the role and its sentence, and two lists
 * below it, each with its own head and the control that belongs to it. The surface is the heavy
 * weight, the edge panel, which is what the human asked for on seeing the centred one.
 *
 * **What is drawn is what this reader may write**: the role and the widening are `changeRole`'s
 * and the workspaces are `grantWorkspace`'s, so a reader holding one meets one section.
 *
 * **An administrator has nothing to widen**, holding every act from the moment they are created,
 * so the list is absent for one and a line stands in its place.
 *
 * **What a member is allowed beyond their role is a plain list**, one line per act with a quiet x
 * at its end, and one picker that ticks several and allows them in one press. *It was a list under
 * two headings, boxed a line at a time, with a chooser that closed on every act it added; the
 * human said it read as a second permissions form and that adding was fiddly.*
 *
 * **Giving out an act that signs a row is the owner's**, so for anybody else the chooser offers
 * the one act that signs nothing and nothing else. Taking an act back stays theirs.
 *
 * The chooser of roles and the chooser of levels draw their lists in a portal on opening, which
 * is what `design/tests/select.ts` exists to reach; the chooser that adds an act is the menu the
 * card's own control is, and opens on a click.
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
			role: 'member',
			permissions: 0,
			rows,
			canRename: false,
			canChangeRole: true,
			canGrantWorkspace: true,
			canGrantSigning: true,
			canGrantReadOnly: true,
			isSaving: false,
			nameRefusal: null,
			roleRefusal: null,
			workspacesRefusal: null,
			onSave: noop,
			...overrides
		},
		inProvider(direction)
	);

const surface = () => document.querySelector('[data-slot=form-surface]');
const usernameInput = () => document.querySelector<HTMLInputElement>('input[name=username]');

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
const tray = (name: string) => document.querySelector(`[data-sheet-tray="${name}"]`);
const section = (name: string) => document.querySelector(`[data-sheet-section="${name}"]`);
const listed = () =>
	Array.from(document.querySelectorAll('[data-act]')).map((row) => row.getAttribute('data-act'));
const head = (name: string) => document.querySelector(`[data-list-head="${name}"]`);
const offered = () =>
	Array.from(document.querySelectorAll('[data-act-offer]')).map((item) =>
		item.getAttribute('data-act-offer')
	);

/** tick one act in the picker. */
const tick = async (act: string) => {
	await fireEvent.click(
		document.querySelector<HTMLButtonElement>(`[data-act-offer="${act}"] [data-slot=checkbox]`)!
	);
};

/** allow everything ticked, which is the picker's one confirm. */
const allow = async () => {
	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-act-allow]')!);
};

/** the segment of the role control a role is offered by. */
const roleItem = (role: string) =>
	document.querySelector<HTMLElement>(`#member-role [data-role="${role}"]`);

/** the segment of a workspace's access control a level is offered by. */
const levelItem = (id: string, level: string) =>
	document.querySelector<HTMLElement>(`#access-${id} [data-level="${level}"]`);

/** open the picker, which stands in the list's own head. */
const openAdd = async () => {
	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-act-add]')!);
};

/** the surface's own footer, which is where every write here keeps its actions. */
const footer = () => surface()?.querySelector('form > div:last-of-type') ?? null;

const submit = async () => {
	const form = document.querySelector('form')!;

	await fireEvent.submit(form);
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

// criterion 23, and the human's second look: one surface of three sections, on the heavy weight,
// which is the panel anchored to the window's edge rather than the centred card.
test('the sheet is a heavy form surface of three sections, named for the member', () => {
	sheet({ permissions: maskOf('renameMember') });

	expect(surface()).not.toBeNull();
	// heavy: the edge panel, the full height of the window, rather than the centred box.
	expect(surface()?.className).toContain('h-full');
	expect(surface()?.className).not.toContain('rounded-3xl');
	expect(surface()?.className).not.toContain('-translate-x-1/2');
	expect(screen.getByText(toTitleCase(en.common.actions.edit))).toBeDefined();
	expect(
		screen.getByText(
			en.organization.dashboard.memberSheetDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();

	expect(
		Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
			block.getAttribute('data-sheet-section')
		)
	).toEqual(['role', 'acts', 'workspaces']);
});

// the human's second look: the same design as a directory, controls on top and records below. The
// tray carries the role and the sentence it means, with the chooser as its own control; each list
// below has a head, and the head carries the control that adds to it where there is one.
test('it reads as a tray on top and lists below, the way a directory does', () => {
	sheet({ permissions: maskOf('renameMember') });

	const trays = Array.from(document.querySelectorAll('[data-sheet-tray]')).map((bar) =>
		bar.getAttribute('data-sheet-tray')
	);

	// one tray, and it is the role's: a list under it that repeated the treatment read as a second
	// form rather than as a list.
	expect(trays).toEqual(['member-role-tray']);

	// the role chooser is the tray's own control, and the tray says what the role held means.
	expect(tray('member-role-tray')?.querySelector('#member-role')).not.toBeNull();
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.dashboard.role);
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.roles.member.who);

	// then the two lists, each with its own head.
	expect(
		Array.from(document.querySelectorAll('[data-list-head]')).map((line) =>
			line.getAttribute('data-list-head')
		)
	).toEqual(['acts', 'workspaces']);

	// the tray stands before the first line of the first list.
	const first = document.querySelector('[data-act]')!;

	expect(
		tray('member-role-tray')!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(head('acts')!.contains(first)).toBe(false);

	// the picker's control belongs to the list it allows into, and the workspaces have none.
	expect(head('acts')?.querySelector('[data-act-add]')).not.toBeNull();
	expect(head('workspaces')?.querySelector('button')).toBeNull();

	// and the save is the surface's, in its own footer, where every write here keeps it.
	const save = screen.getByRole('button', { name: en.common.actions.save });

	expect(footer()?.contains(save)).toBe(true);
	expect(document.querySelector('[data-sheet-tray]')?.contains(save)).toBe(false);
});

// criterion 23: the chooser says who the chosen role is for, under the control, and the owner's
// role is not one of the two it offers: ownership moves a key and two rows, and is handed over by
// its own act. Two exclusive choices are a toggle group ([[rules/interface]], *Field kinds*), and
// a segment has no room for a sentence, so the one said is the one chosen.
test('the role chooser says who the chosen role is for, and never offers the owner', async () => {
	sheet();

	const roles = document.querySelector<HTMLElement>('#member-role')!;

	expect(
		within(roles)
			.getAllByRole('radio')
			.map((segment) => segment.getAttribute('data-role'))
	).toEqual(['member', 'administrator']);
	expect(roleItem('member')?.getAttribute('aria-checked')).toBe('true');
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.roles.member.who);
	expect(tray('member-role-tray')?.textContent).not.toContain(
		en.organization.roles.administrator.who
	);

	await fireEvent.click(roleItem('administrator')!);

	expect(roleItem('administrator')?.getAttribute('aria-checked')).toBe('true');
	expect(tray('member-role-tray')?.textContent).toContain(en.organization.roles.administrator.who);
	expect(tray('member-role-tray')?.textContent).not.toContain(en.organization.roles.member.who);

	// the sentence stands under the control rather than beside the legend.
	const said = within(tray('member-role-tray') as HTMLElement).getByText(
		en.organization.roles.administrator.who
	);

	expect(roles.compareDocumentPosition(said) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	expect(roleItem('owner')).toBeNull();
	expect(screen.queryByText(en.organization.roles.owner.who)).toBeNull();
	// and the administrator's names the one thing the word does not cover.
	expect(en.organization.roles.administrator.who).toMatch(/Turso account/);
});

// the human's third look: what a member may do beyond their role is a short plain list, one line
// per act with a quiet x at its end. No headings over it, no box around a line, and nothing in it
// that is not held.
test('what a member may do beyond their role is a plain list, one line and one x per act', () => {
	sheet({ permissions: maskOf('renameMember', 'grantWorkspace') });

	expect(section('acts')).not.toBeNull();
	expect(head('acts')?.textContent).toContain(en.organization.dashboard.beyondRole);
	expect(head('acts')?.textContent).toContain(en.organization.dashboard.beyondRoleDescription);

	expect(listed()).toEqual(['renameMember', 'grantWorkspace']);
	expect(screen.getByText(en.organization.acts.renameMember.does)).toBeDefined();
	expect(screen.getByText(en.organization.acts.grantWorkspace.does)).toBeDefined();

	// one line apiece, each with its own x, and no heading dividing them.
	for (const act of ['renameMember', 'grantWorkspace']) {
		const line = document.querySelector(`[data-act="${act}"]`)!;

		expect(line.tagName, act).toBe('LI');
		expect(line.querySelector(`[data-act-remove="${act}"]`), act).not.toBeNull();
		expect(line.querySelectorAll('button'), act).toHaveLength(1);
	}
	expect(document.querySelector('[data-act-group]')).toBeNull();
	expect(section('acts')?.querySelector('[data-slot=checkbox]')).toBeNull();
	expect(document.querySelector('[data-acts-none]')).toBeNull();
});

// and each line reads as what the person can do, in a few plain words.
test('every act reads as what the person can do', () => {
	sheet({ permissions: maskOf(...EVERY_ADMINISTRATION) });

	const lines = Array.from(document.querySelectorAll('[data-act-says]')).map((said) =>
		said.textContent?.trim()
	);

	for (const said of lines) {
		expect(said?.startsWith('can '), said ?? '').toBe(true);
		expect(said?.split(' ').length, said ?? '').toBeLessThanOrEqual(8);
	}
	expect(lines).toContain(en.organization.acts.inviteMember.does);
});

test('a member allowed nothing beyond their role is told so in one line, beside the control', () => {
	sheet();

	expect(listed()).toEqual([]);
	expect(document.querySelector('[data-acts-none]')?.textContent?.trim()).toBe(
		en.organization.dashboard.beyondRoleNone
	);
	// the line stands in the list's place, and the control that allows something is still there.
	expect(head('acts')?.querySelector('[data-act-add]')).not.toBeNull();
});

// the human's third look: one picker, everything not held in it as a checkbox, and one confirm
// that allows every ticked act at once. Adding three used to be three openings of a chooser.
test('the picker ticks several acts and allows them in one press', async () => {
	const saved: number[] = [];

	sheet({
		permissions: maskOf('renameMember'),
		onSave: (edit) => saved.push(edit.permissions)
	});

	await openAdd();

	// everything the member does not hold, and nothing they do.
	expect(offered()).toEqual([
		'inviteMember',
		'removeMember',
		'resetPassword',
		'changeRole',
		'renameWorkspace',
		'grantWorkspace'
	]);
	expect(screen.getByText(en.organization.acts.inviteMember.does)).toBeDefined();
	// nothing is allowed until the confirm is pressed, so it is refused until something is ticked.
	expect(
		document.querySelector<HTMLButtonElement>('[data-act-allow]')?.hasAttribute('disabled')
	).toBe(true);

	await tick('inviteMember');
	await tick('resetPassword');

	// still nothing on the list: ticking chooses, the confirm allows.
	expect(listed()).toEqual(['renameMember']);

	await allow();

	expect(listed()).toEqual(['inviteMember', 'renameMember', 'resetPassword']);
	// the picker closes on the one press, so a second act is not a second opening.
	expect(document.querySelector('[data-act-picker]')).toBeNull();

	await submit();

	expect(saved).toEqual([maskOf('renameMember', 'inviteMember', 'resetPassword')]);
});

test('and the x takes one back off the list', async () => {
	const saved: number[] = [];

	sheet({
		permissions: maskOf('renameMember', 'inviteMember'),
		onSave: (edit) => saved.push(edit.permissions)
	});

	await fireEvent.click(
		document.querySelector<HTMLButtonElement>('[data-act-remove="inviteMember"]')!
	);

	expect(listed()).toEqual(['renameMember']);

	await submit();

	expect(saved).toEqual([maskOf('renameMember')]);
});

// criterion 23: an administrator holds every act, so there is nothing to widen and one line says
// so in the list's place.
test('an administrator meets no also-allowed list, and one line instead', async () => {
	const administrator = sheet({ role: 'administrator', permissions: maskOf('inviteMember') });

	expect(section('acts')).toBeNull();
	expect(document.querySelector('[data-acts-every]')?.textContent?.trim()).toBe(
		en.organization.dashboard.administratorAllowedEvery
	);
	administrator.unmount();

	// and the same on a member the reader promotes here: picking the role fills the column in with
	// what that role is created with (826, requirement 6), so the list has nothing left to say.
	sheet();

	expect(section('acts')).not.toBeNull();
	expect(document.querySelector('[data-acts-every]')).toBeNull();

	await fireEvent.click(roleItem('administrator')!);

	expect(section('acts')).toBeNull();
	expect(document.querySelector('[data-acts-every]')).not.toBeNull();
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
	expect(screen.getByText(en.organization.dashboard.accessTakenBack)).toBeDefined();

	// each row says what the member holds on that workspace, in words, beside its name.
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.levels.full.does
	);
	expect(document.querySelector('[data-access-says="ws-2"]')?.textContent?.trim()).toBe(
		en.organization.levels.none.does
	);

	// the three levels side by side, fullest first, as a choice of three is ([[rules/interface]],
	// *Field kinds*).
	expect(
		within(document.querySelector<HTMLElement>('#access-ws-1')!)
			.getAllByRole('radio')
			.map((segment) => segment.getAttribute('data-level'))
	).toEqual(['full-access', 'read-only', 'none']);
	expect(levelItem('ws-1', 'full-access')?.getAttribute('aria-checked')).toBe('true');

	// and the sentence under the control follows the level chosen, one level at a time.
	const says = document.querySelector('[data-access-says="ws-1"]')!;

	await fireEvent.click(levelItem('ws-1', 'read-only')!);
	expect(says.textContent?.trim()).toBe(en.organization.levels.readOnly.does);

	await fireEvent.click(levelItem('ws-1', 'none')!);
	expect(says.textContent?.trim()).toBe(en.organization.levels.none.does);

	expect(
		document.querySelector('#access-ws-1')!.compareDocumentPosition(says) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

// criterion 23: one save, and the three acts it runs are handed back together. What comes back
// for the workspaces is what changed, by row id, so a save writes no grant nobody touched.
test('one save hands back the role, the acts and the workspaces that changed', async () => {
	const saved: unknown[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(levelItem('ws-2', 'full-access')!);
	await openAdd();
	await tick('renameMember');
	await allow();
	await submit();

	expect(saved).toEqual([
		{
			// the reader may not rename here, so the name handed back is the one the member holds.
			username: 'ada',
			role: 'member',
			permissions: maskOf('renameMember'),
			changes: [{ id: 'ws-2', access: 'full-access' }]
		}
	]);
});

// [[rules/interface]], *Validation errors*: a refusal marks the section that asked for the
// change rather than a summary the surface places. One act writes the role and the column, so
// what it was asked for is what says which of the two it refused.
test('a refusal marks its own section', async () => {
	const onActs = sheet({ permissions: maskOf('renameMember'), roleRefusal: 'that is the owners' });

	// the role was not touched, so the sentence belongs to the widening.
	expect(section('acts')?.querySelector('[data-sheet-error="acts"]')?.textContent?.trim()).toBe(
		'that is the owners'
	);
	expect(document.querySelector('[data-sheet-error="role"]')).toBeNull();
	onActs.unmount();

	const onRole = sheet({ roleRefusal: 'that is the owners' });

	await fireEvent.click(roleItem('administrator')!);

	expect(section('role')?.querySelector('[data-sheet-error="role"]')?.textContent?.trim()).toBe(
		'that is the owners'
	);
	onRole.unmount();

	sheet({ workspacesRefusal: 'no workspace by that name' });

	expect(
		section('workspaces')?.querySelector('[data-sheet-error="workspaces"]')?.textContent?.trim()
	).toBe('no workspace by that name');
	expect(document.querySelector('[data-sheet-error="role"]')).toBeNull();
});

// effort 826, requirements 5 and 6: handing out an act that signs a row is the owner's, and so is
// minting a read only credential. For anybody else the chooser leaves the signing acts out, and
// there is nothing to explain about a control that is not there.
test('a reader who is not the owner is offered the one act that signs nothing, and no other', async () => {
	sheet({ canGrantSigning: false, canGrantReadOnly: false, permissions: maskOf('renameMember') });

	await openAdd();

	// absent rather than drawn refused: a control that cannot change anything is noise on a picker
	// whose whole point is what can be allowed.
	expect(offered()).toEqual(['renameWorkspace']);
	expect(
		document.querySelector('[data-act-offer] [data-slot=checkbox]')?.hasAttribute('disabled')
	).toBe(false);
	// taking one back is still theirs, on an act that signs as much as on one that does not.
	expect(document.querySelector('[data-act-remove="renameMember"]')).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.administratorsAreTheOwners)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.readOnlyIsTheOwners)).toBeDefined();
});

test('and the administrator role is drawn refused for them, rather than hidden', async () => {
	sheet({ canGrantSigning: false });

	expect(roleItem('administrator')?.hasAttribute('disabled')).toBe(true);
	expect(roleItem('member')?.hasAttribute('disabled')).toBe(false);
});

test('a reader holding every act meets no refusal sentence at all', async () => {
	sheet({ permissions: maskOf('renameMember') });

	expect(document.querySelector('[data-role-refusal]')).toBeNull();
	expect(document.querySelector('[data-access-refusal]')).toBeNull();

	await openAdd();

	expect(offered()).toHaveLength(6);
});

// effort 826, requirement 15: the acts are gated separately, so a reader holding one of the two
// meets one section rather than controls that refuse them.
test('each section is drawn by the act it is written with', () => {
	const granting = sheet({ canChangeRole: false });

	expect(section('role')).toBeNull();
	expect(section('acts')).toBeNull();
	expect(section('workspaces')).not.toBeNull();
	granting.unmount();

	sheet({ canGrantWorkspace: false });

	expect(section('role')).not.toBeNull();
	expect(section('acts')).not.toBeNull();
	expect(section('workspaces')).toBeNull();
});

// effort 832, requirement 6: one verb per act. The name was its own surface behind a *rename*
// entry beside the *edit*; it is the sheet's first section now, drawn by `renameMember` alone.
test('the name is the first section, drawn by renameMember and opened on the name they hold', () => {
	const renaming = sheet({ canRename: true });

	expect(
		Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
			block.getAttribute('data-sheet-section')
		)
	).toEqual(['name', 'role', 'acts', 'workspaces']);
	expect(usernameInput()?.value).toBe('ada');
	expect(section('name')?.querySelector('[data-list-head="member-name"]')?.textContent).toContain(
		en.organization.dashboard.renameDescription
	);
	renaming.unmount();

	// a reader holding renameMember alone meets the name and nothing else.
	sheet({ canRename: true, canChangeRole: false, canGrantWorkspace: false });

	expect(
		Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
			block.getAttribute('data-sheet-section')
		)
	).toEqual(['name']);
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
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());

	await submit();

	expect(saved).toEqual([]);
});

// and what Rust refuses (a username somebody holds) marks the name the way the others mark theirs.
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

test('and in arabic every sentence reads in its own words, right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ permissions: maskOf('renameMember') }, 'rtl');

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.acts.renameMember.does)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.beyondRole)).toBeDefined();
	expect(ar.organization.acts.renameMember.does).not.toBe(en.organization.acts.renameMember.does);

	expect(tray('member-role-tray')?.textContent).toContain(ar.organization.roles.member.who);
	expect(ar.organization.roles.member.who).not.toBe(en.organization.roles.member.who);

	setLocale('en');
});

// the package is what the seven acts are read from, so an act added there arrives on this surface
// with its line rather than being forgotten on it.
test('every act the package carries has a line on this surface', async () => {
	sheet();

	await openAdd();

	expect(offered()).toHaveLength(7);

	for (const act of offered()) {
		expect(
			document.querySelector(`[data-act-offer="${act}"]`)?.textContent?.trim().length,
			act ?? ''
		).toBeGreaterThan(0);
	}
	expect(permits(maskOf('renameWorkspace'), 'renameWorkspace')).toBe(true);
});
