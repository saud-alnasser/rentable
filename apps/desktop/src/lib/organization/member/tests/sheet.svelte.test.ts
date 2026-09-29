import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import MemberSheet, { type MemberEdit } from '$lib/organization/member/component/sheet.svelte';
import { flagPhrase } from '$lib/organization/role/role';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import { fakeOrganizationRoles } from '$lib/organization/tests/testing';
import { BUILT_IN, WRITE_FLAGS, maskOf, permits } from '@rentable/workspace-permission';

import Providers from '$lib/organization/tests/providers.svelte';
import { unfold } from '$lib/organization/tests/switches';

/**
 * ONE MEMBER, ON ONE SURFACE
 *
 * Criterion 23 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] and
 * requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] from the sheet's
 * own side: the name, the role in the tray, what the member may do as switches, and the
 * workspaces, with one save that hands the four back together.
 *
 * **What the member may do is the switches set to what they end up with** (requirement 12 as
 * amended 2026-09-27). A switch that differs from their role is marked, the role reads as custom
 * where any does, and a reset puts them back on the role. The override is never shown: the save
 * hands back the one the switches come to.
 *
 * **Beneath a workspace the member is in, its permissions fold** (requirement 12 as amended a
 * third and a fourth time): the record groups, measured against what they may do across the
 * organization, set there where they differ from it and unset where turned back, and a grant
 * minted read only drawn with its writes off. No lock, no read only and no reset is drawn: read
 * only is those switches, and turning them back is the reset.
 *
 * **A control the reader may not use says why**: a role at or above the reader's rank, a flag the
 * reader does not hold, or a section whose flag the reader lacks.
 *
 * The surface submits through the form's own submit, which this one can fire: it holds choices
 * between fixed values and declares no schema, so nothing here reaches SvelteKit's `applyAction`.
 */

const noop = () => {};

// the design and tooltip providers: a switch the reader may not turn says why in a tooltip.
const inProvider = (direction: 'ltr' | 'rtl' = 'ltr') => ({
	wrapper: Providers,
	wrapperProps: { strings, direction }
});

const rows = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		access: 'full-access' as const,
		pinned: 0,
		granted: 0,
		givable: true
	},
	{ id: 'ws-2', name: 'Jeddah', access: 'none' as const, pinned: 0, granted: 0, givable: true }
];

/** a grant the owner minted read only before the lock left, with nothing set there. */
const minted = { ...rows[0], access: 'read-only' as const };

/** every add, edit and delete the member role carries. */
const MEMBER_WRITES = maskOf(...WRITE_FLAGS.filter((flag) => permits(BUILT_IN.member.mask, flag)));

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
		resolve(process.cwd(), 'tauri/src/organization/invitation/username.rs'),
		'utf8'
	);
	const declared = /pub const USERNAME_RULES: &str = "([^"]+)";/.exec(source);

	if (!declared) throw new Error('invitation/username.rs no longer declares USERNAME_RULES');

	return declared[1];
};

/** a workspace's switch, and whether it is on or dimmed. */
const inSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}`);
const checked = (element: HTMLElement | null) => element?.getAttribute('aria-checked') === 'true';
const dimmed = (element: HTMLElement | null) => element?.getAttribute('aria-disabled') === 'true';
const workspaceReasons = () =>
	Array.from(document.querySelectorAll('[data-access-refusal]')).map((line) =>
		line.textContent?.trim()
	);

/** a workspace's permissions: their fold, its custom mark, and their switches. */
const tailorFold = (id: string) =>
	document.querySelector<HTMLElement>(`[data-tailor="access-${id}-tailor"] [data-tailor-fold]`);
const tailorCustom = (id: string) =>
	document.querySelector(`[data-tailor="access-${id}-tailor"] [data-tailor-custom]`);
const tailorOpen = (id: string) =>
	document.querySelector(`[data-tailor-open="access-${id}-tailor"]`);
const tailorSwitch = (id: string, flag: string) =>
	document.querySelector<HTMLElement>(`#access-${id}-tailor-${flag}`);
const tailorOn = (id: string, flag: string) => {
	const control = tailorSwitch(id, flag);

	if (!control) throw new Error(`no switch for ${flag} in ${id}`);

	return checked(control);
};
const tailorMarks = (id: string) =>
	Array.from(tailorOpen(id)?.querySelectorAll('[data-switch-row] [data-differs]') ?? []).map(
		(mark) => mark.getAttribute('data-differs')
	);

/** opens a workspace's permissions, and every group inside them. */
const openTailoring = async (id: string) => {
	await fireEvent.click(tailorFold(id)!);
	await unfold(undefined, tailorOpen(id)!);
};

/** the role's chooser, and each role it offers once opened. */
const roleTrigger = () => document.querySelector<HTMLElement>('#member-role')!;
const roleOption = (id: string) =>
	document.querySelector<HTMLElement>(`[data-slot=select-item][data-role="${id}"]`);

/** a flag's switch, whether it is on, and a press on it. */
const control = (flag: string) => document.querySelector<HTMLElement>(`#member-override-${flag}`);
const isOn = (flag: string) => {
	const each = control(flag);

	if (!each) throw new Error(`no switch for ${flag}; is its group open?`);

	return each.getAttribute('aria-checked') === 'true';
};

/** opens every group of what the member may do across the organization. */
const openOverride = () => unfold(undefined, section('override')!);

const turn = async (flag: string) => {
	await fireEvent.click(control(flag)!);
};

/** the dot a switch that differs from the role carries, the custom mark, and the reset. */
const differs = (flag: string) => document.querySelector(`[data-differs="${flag}"]`);
const customMark = () => document.querySelector('[data-role-custom]');
const resetControl = () => document.querySelector<HTMLElement>('[data-role-reset]');

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
// the human's call on the running application, 2026-09-28: each of the three layers is titled by
// where it reaches, the role, then the organization, then each workspace.
test('the three layers are titled by their scope: role, organization, workspaces', () => {
	sheet();

	const legend = (name: string) =>
		section(name)?.querySelector('legend')?.textContent?.trim().toLowerCase();

	expect(legend('role')).toBe(en.organization.dashboard.role);
	expect(legend('override')).toBe(en.organization.override.legend);
	expect(legend('workspaces')).toBe(en.organization.override.workspaces);
	expect(section('override')?.textContent).toContain(en.organization.override.says);
	expect(section('workspaces')?.textContent).toContain(en.organization.override.workspacesSays);
});

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

// requirement 12 as amended: the switches read what the member ends up with, never the sum. The
// member role carries editing a payment and not deleting one.
test('the switches show what they end up with, and each that differs from the role is marked', async () => {
	sheet({ override: maskOf('editPayment') });
	await openOverride();

	// the role gives editing, and it was taken from them: off, marked as differing from the role.
	expect(isOn('editPayment')).toBe(false);
	expect(differs('editPayment')?.getAttribute('aria-label')).toBe(
		en.organization.switches.differs.replace('{role:string}', en.layout.signIn.roleMember)
	);
	expect(control('editPayment')?.getAttribute('aria-describedby')).toContain(
		'member-override-editPayment-differs'
	);
	// so they read as custom beside the role's name, with the reset in the switches' head.
	expect(customMark()?.textContent?.trim()).toBe(en.organization.switches.custom);
	expect(roleTrigger().contains(customMark())).toBe(true);
	expect(resetControl()?.textContent?.trim()).toBe(
		en.organization.switches.reset.replace('{role:string}', en.layout.signIn.roleMember)
	);

	// the role does not give deleting, and nor does anything else: off, and nothing marked.
	expect(isOn('deletePayment')).toBe(false);
	expect(differs('deletePayment')).toBeNull();

	await turn('deletePayment');

	expect(isOn('deletePayment')).toBe(true);
	expect(differs('deletePayment')).not.toBeNull();

	// every kind is a group under its glyph, the organization's last, and nothing of the owner's is
	// a switch: it is one line.
	expect(
		Array.from(document.querySelectorAll('[data-switches-group]')).map((group) =>
			group.getAttribute('data-switches-group')
		)
	).toEqual(['complex', 'unit', 'tenant', 'contract', 'payment', 'administration']);
	expect(document.querySelector('[data-switch="lockOut"]')).toBeNull();
	expect(document.querySelector('[data-switches-owner]')?.textContent?.trim()).toBe(
		en.organization.switches.owner
	);
});

// the save hands back the override the switches come to: the role exclusive-or'd with them.
test('the save writes the override the switches come to', async () => {
	const saved: { override: number }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });
	await openOverride();

	expect(customMark()).toBeNull();
	expect(resetControl()).toBeNull();

	await turn('editPayment');
	await turn('deletePayment');
	await submit();

	expect(saved.map((edit) => edit.override)).toEqual([maskOf('editPayment', 'deletePayment')]);
});

// requirement 6 as amended: turning a kind's view off turns its writes off with it, and refuses
// them while it is off; what is saved is the override that takes all three away.
test('turning a view off turns its add, edit and delete off, and refuses them', async () => {
	const saved: { override: number }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });
	await openOverride();

	await turn('viewContract');

	expect(isOn('viewContract')).toBe(false);
	expect(isOn('createContract')).toBe(false);
	expect(control('createContract')?.getAttribute('aria-disabled')).toBe('true');
	expect(
		document.querySelector('#member-override-createContract-reason')?.textContent?.trim()
	).toBe(en.organization.switches.viewFirst);

	await submit();

	expect(saved.map((edit) => edit.override)).toEqual([
		maskOf('viewContract', 'createContract', 'editContract')
	]);
});

// the reset clears the override: the member is their role exactly again, and reads so.
test('reset puts them back on their role exactly', async () => {
	const saved: { override: number }[] = [];

	sheet({ override: maskOf('editPayment', 'deleteTenant'), onSave: (edit) => saved.push(edit) });
	await openOverride();

	expect(isOn('deleteTenant')).toBe(true);

	await fireEvent.click(resetControl()!);

	expect(isOn('editPayment')).toBe(true);
	expect(isOn('deleteTenant')).toBe(false);
	expect(document.querySelector('[data-differs]')).toBeNull();
	expect(customMark()).toBeNull();
	expect(resetControl()).toBeNull();

	await submit();

	expect(saved.map((edit) => edit.override)).toEqual([0]);
});

// requirement 7: a reset that would change a permission the reader does not hold is not theirs,
// and says so.
test('a reset that changes a permission the reader does not hold is refused, saying so', async () => {
	sheet({
		override: maskOf('deletePayment'),
		readerPermissions: BUILT_IN.manager.mask - maskOf('deletePayment')
	});
	await openOverride();

	const reset = resetControl()!;

	expect(reset.getAttribute('aria-disabled')).toBe('true');
	expect(reset.querySelector('.sr-only')?.textContent?.trim()).toBe(
		en.organization.switches.resetNotHeld
	);

	await fireEvent.click(reset);

	expect(isOn('deletePayment')).toBe(true);
	expect(customMark()).not.toBeNull();
});

// requirement 6 as amended, and the shell's assignRole: picking another role makes them that role
// exactly, so nothing changed against the old one follows them to the new one.
test('picking another role makes them that role exactly', async () => {
	const saved: { roleId: string; override: number }[] = [];

	sheet({ override: maskOf('editPayment'), onSave: (edit) => saved.push(edit) });
	await openOverride();

	await openSelect(roleTrigger());
	await chooseOption(roleOption('supervisor')!);

	expect(roleTrigger().textContent?.trim()).toBe('supervisor');
	// a role the organization made has no who-line of its own.
	expect(tray('member-role-tray')?.querySelector('[data-role-who]')).toBeNull();
	expect(isOn('editPayment')).toBe(true);
	expect(customMark()).toBeNull();

	await submit();

	expect(saved.map(({ roleId, override }) => ({ roleId, override }))).toEqual([
		{ roleId: 'supervisor', override: 0 }
	]);
});

// ticket 45: their own role picked again is them as they are, with what was changed for them, so
// the card neither reads as the role exactly nor saves them so.
test('picking their own role again puts back what was changed for them', async () => {
	const saved: { roleId: string; override: number }[] = [];

	sheet({ override: maskOf('editPayment'), onSave: (edit) => saved.push(edit) });
	await openOverride();

	await openSelect(roleTrigger());
	await chooseOption(roleOption('supervisor')!);

	expect(customMark()).toBeNull();

	await openSelect(roleTrigger());
	await chooseOption(roleOption('member')!);

	expect(isOn('editPayment')).toBe(false);
	expect(customMark()).not.toBeNull();

	await submit();

	expect(saved.map(({ roleId, override }) => ({ roleId, override }))).toEqual([
		{ roleId: 'member', override: maskOf('editPayment') }
	]);
});

// ticket 45, requirement 7: a role whose pick would move a flag the reader does not hold (here,
// the one the member's own change gives them, which every other role takes away) is refused in
// the list, naming the flag, and their own role is not.
test('a role whose pick moves a flag the reader does not hold is refused, naming it', async () => {
	sheet({
		override: maskOf('renameMember'),
		readerPermissions: BUILT_IN.manager.mask - maskOf('renameMember')
	});

	await openSelect(roleTrigger());

	const reason = en.organization.foreseen.roleMoves.replace(
		'{flag:string}',
		en.organization.flags.renameMember
	);

	for (const id of ['supervisor', 'collector']) {
		expect(roleOption(id)?.getAttribute('aria-disabled')).toBe('true');
		expect(roleOption(id)?.querySelector('[data-role-item-refusal]')?.textContent?.trim()).toBe(
			reason
		);
	}
	expect(roleOption('member')?.hasAttribute('data-disabled')).toBe(false);
	expect(roleOption('member')?.querySelector('[data-role-item-refusal]')).toBeNull();
});

test('a reader holding every flag a pick moves may pick any role below them', async () => {
	sheet({ override: maskOf('renameMember') });

	await openSelect(roleTrigger());

	expect(roleOption('supervisor')?.hasAttribute('data-disabled')).toBe(false);
	expect(document.querySelector('[data-role-item-refusal]')).toBeNull();
});

// requirement 7: a flag the reader does not hold is theirs neither to give nor to take, so its
// switch is dimmed, says why at the control, and one sentence above the list says why.
test('a flag the reader does not hold is dimmed, saying so, and does not turn', async () => {
	sheet({ readerPermissions: BUILT_IN.manager.mask - maskOf('deletePayment') });
	await openOverride();

	const refused = control('deletePayment')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('disabled')).toBe(false);
	expect(refused.getAttribute('aria-describedby')).toBe(
		'member-override-deletePayment-says member-override-deletePayment-reason'
	);
	expect(document.querySelector('#member-override-deletePayment-reason')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);
	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);

	await turn('deletePayment');

	expect(isOn('deletePayment')).toBe(false);
	// a flag they do hold is theirs.
	expect(control('editPayment')?.hasAttribute('aria-disabled')).toBe(false);
});

// the flag: a reader without assignRole reads the role and may not change it, and one without
// overrideMember reads the switches and may turn none of them. Each says which flag.
test('a section whose flag the reader lacks is drawn, refused, naming the flag', async () => {
	sheet({ canAssignRole: false, canOverride: false });
	await openOverride();

	expect(
		section('role')?.querySelector('[data-sheet-tray] [data-role-refusal]')?.textContent?.trim()
	).toBe(
		en.organization.dashboard.lacksFlag.replace('{flag:string}', en.organization.flags.assignRole)
	);
	expect(roleTrigger().hasAttribute('disabled')).toBe(true);
	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		en.organization.dashboard.lacksFlag.replace(
			'{flag:string}',
			en.organization.flags.overrideMember
		)
	);
	expect(
		Array.from(document.querySelectorAll('[data-switch]')).every(
			(each) => each.getAttribute('aria-disabled') === 'true'
		)
	).toBe(true);
	// the facts are still there to read.
	expect(isOn('viewComplex')).toBe(true);
});

// ticket 48 of effort 838, requirement 12 as amended again, a third and a fourth time: a
// workspace is one switch, its access, in or out, and no level is offered beside the role.
// Beneath one the member is in, its permissions fold behind one line; no lock is drawn.
test('each workspace is its access switch, with its permissions folded beneath one that is in', () => {
	sheet();

	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ws-1', 'ws-2']);
	expect(screen.getByText('Riyadh')).toBeDefined();
	expect(inSwitch('ws-1')?.getAttribute('role')).toBe('switch');
	expect(inSwitch('ws-1')?.getAttribute('aria-label')).toBe('Riyadh');
	expect(checked(inSwitch('ws-1'))).toBe(true);
	expect(checked(inSwitch('ws-2'))).toBe(false);

	// the fold, under the workspace they are in and not under the one they are out of, a button
	// saying whether it is open, and nothing differing, so nothing reads custom and no switch is
	// drawn until it is opened.
	expect(tailorFold('ws-1')?.textContent).toContain(en.organization.workspaceSwitches.permissions);
	expect(tailorFold('ws-1')?.getAttribute('aria-expanded')).toBe('false');
	expect(tailorFold('ws-2')).toBeNull();
	expect(tailorCustom('ws-1')).toBeNull();
	expect(tailorSwitch('ws-1', 'viewPayment')).toBeNull();

	// no lock, and neither the level words nor a segment.
	const words = section('workspaces')?.textContent ?? '';

	expect(document.querySelector('[data-access-lock], [data-access-lock-row]')).toBeNull();
	expect(words).not.toContain('lock');
	expect(words).not.toContain(en.organization.dashboard.accessFull);
	expect(words).not.toContain('no access');
	expect(document.querySelector('[data-access-row] [data-slot=toggle-group-item]')).toBeNull();
	expect(workspaceReasons()).toEqual([]);
});

// in: switching a workspace on is a full-access grant, and its tailoring appears under it.
test('switching a workspace on puts them in it at full access', async () => {
	const saved: MemberEdit[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-2')!);

	expect(checked(inSwitch('ws-2'))).toBe(true);
	expect(tailorFold('ws-2')).not.toBeNull();

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-2', access: 'full-access' }]]);
	expect(saved.map((edit) => edit.tailored)).toEqual([[]]);
});

// out: switching it off withdraws it, and its tailoring goes with it.
test('switching a workspace off takes them out of it', async () => {
	const saved: MemberEdit[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-1')!);

	expect(checked(inSwitch('ws-1'))).toBe(false);
	expect(tailorFold('ws-1')).toBeNull();

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-1', access: 'none' }]]);
});

// opened, the permissions are the record groups of the shared list, each folding in turn, set to
// what the member may do across the organization, with the one line that says what they are
// measured against. The organization's ten and the owner's line are not a workspace's to switch,
// and there is no read only or reset button.
test('opened, the permissions are the record groups, measured against the organization', async () => {
	sheet();

	await fireEvent.click(tailorFold('ws-1')!);

	expect(tailorFold('ws-1')?.getAttribute('aria-expanded')).toBe('true');
	expect(
		Array.from(tailorOpen('ws-1')!.querySelectorAll('[data-switches-fold]')).map((fold) => [
			fold.getAttribute('data-switches-fold'),
			fold.getAttribute('aria-expanded')
		])
	).toEqual([
		['complex', 'false'],
		['unit', 'false'],
		['tenant', 'false'],
		['contract', 'false'],
		['payment', 'false']
	]);
	expect(tailorOpen('ws-1')!.querySelector('[data-switches-owner]')).toBeNull();
	expect(document.querySelector('[data-tailor-says]')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.permissionsSays
	);
	expect(document.querySelector('[data-tailor-preset]')).toBeNull();
	expect(section('workspaces')?.querySelectorAll('[data-slot=button]')).toHaveLength(0);

	await unfold(undefined, tailorOpen('ws-1')!);

	// the member role: payments viewed, added and edited, not deleted.
	expect(tailorOn('ws-1', 'viewPayment')).toBe(true);
	expect(tailorOn('ws-1', 'editPayment')).toBe(true);
	expect(tailorOn('ws-1', 'deletePayment')).toBe(false);
	expect(tailorMarks('ws-1')).toEqual([]);
});

// requirement 12 as amended a fourth time: what is set in a workspace is what differs from the
// organization. A switch turned away carries the dot saying so and the fold reads custom; turned
// back, it is set no longer, and the save writes nothing for the workspace.
test('a switch turned there is marked, reads custom, and turned back is set no longer', async () => {
	const saved: MemberEdit[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await openTailoring('ws-1');
	await fireEvent.click(tailorSwitch('ws-1', 'deletePayment')!);

	expect(tailorOn('ws-1', 'deletePayment')).toBe(true);
	expect(
		tailorOpen('ws-1')!.querySelector('[data-differs="deletePayment"]')?.getAttribute('aria-label')
	).toBe(en.organization.workspaceSwitches.differs);
	expect(tailorMarks('ws-1')).toEqual(['deletePayment']);
	// the payments head says so while folded.
	expect(tailorOpen('ws-1')!.querySelector('[data-differs="payment"]')).not.toBeNull();
	expect(tailorCustom('ws-1')?.textContent?.trim()).toBe(en.organization.switches.custom);

	// turned back, it agrees with the organization again: no dot, nothing custom.
	await fireEvent.click(tailorSwitch('ws-1', 'deletePayment')!);

	expect(tailorOn('ws-1', 'deletePayment')).toBe(false);
	expect(tailorMarks('ws-1')).toEqual([]);
	expect(tailorCustom('ws-1')).toBeNull();

	await submit();

	expect(saved.map((edit) => edit.tailored)).toEqual([[]]);
});

test('the save writes what differs there, for that workspace alone', async () => {
	const saved: MemberEdit[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await openTailoring('ws-1');
	await fireEvent.click(tailorSwitch('ws-1', 'deletePayment')!);
	await fireEvent.click(tailorSwitch('ws-1', 'editUnit')!);
	await fireEvent.click(tailorSwitch('ws-1', 'editUnit')!);
	await submit();

	expect(saved).toEqual([
		{
			username: 'ada',
			roleId: 'member',
			override: 0,
			changes: [],
			tailored: [{ id: 'ws-1', pinned: maskOf('deletePayment'), granted: maskOf('deletePayment') }]
		}
	]);
});

// every add, edit and delete turned off there is read only, written as the switches that differ,
// and no grant is written: read only is these switches, enforced by the application.
test('turning every write off there sets each one the organization gives off, and grants nothing', async () => {
	const saved: MemberEdit[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await openTailoring('ws-1');

	for (const flag of WRITE_FLAGS.filter((each) => permits(BUILT_IN.member.mask, each))) {
		await fireEvent.click(tailorSwitch('ws-1', flag)!);
	}

	expect(tailorOn('ws-1', 'viewPayment')).toBe(true);
	expect(tailorOn('ws-1', 'createPayment')).toBe(false);
	expect(tailorOn('ws-1', 'editContract')).toBe(false);

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[]]);
	expect(saved.map((edit) => edit.tailored)).toEqual([
		[{ id: 'ws-1', pinned: MEMBER_WRITES, granted: 0 }]
	]);
});

// a pin that agrees with the organization is not a difference: it reads as nothing set, and a
// save that touches the workspace lets it go.
test('what was set there and agrees with the organization reads as nothing set, and goes', async () => {
	const saved: MemberEdit[] = [];

	sheet({
		rows: [{ ...rows[0], pinned: maskOf('editPayment'), granted: maskOf('editPayment') }],
		onSave: (edit) => saved.push(edit)
	});

	expect(tailorCustom('ws-1')).toBeNull();

	await openTailoring('ws-1');

	expect(tailorMarks('ws-1')).toEqual([]);

	await fireEvent.click(tailorSwitch('ws-1', 'deleteUnit')!);
	await fireEvent.click(tailorSwitch('ws-1', 'deleteUnit')!);
	await submit();

	expect(saved.map((edit) => edit.tailored)).toEqual([[{ id: 'ws-1', pinned: 0, granted: 0 }]]);
});

// requirement 12 as amended a third time: a grant minted read only reads with its writes off,
// which differ from the organization, and turning a write back on makes it a full-access grant,
// with every other write the grant was clearing set off, so the member ends up with what the
// switches show.
test('a grant minted read only reads with its writes off, and a write turned on grants it full access', async () => {
	const saved: MemberEdit[] = [];

	sheet({ rows: [minted], onSave: (edit) => saved.push(edit) });

	expect(tailorCustom('ws-1')).not.toBeNull();

	await openTailoring('ws-1');

	expect(tailorOn('ws-1', 'viewPayment')).toBe(true);
	expect(tailorOn('ws-1', 'createPayment')).toBe(false);
	expect(tailorMarks('ws-1')).toContain('createPayment');
	expect(tailorMarks('ws-1')).not.toContain('viewPayment');

	await fireEvent.click(tailorSwitch('ws-1', 'createPayment')!);

	expect(tailorOn('ws-1', 'createPayment')).toBe(true);
	expect(tailorMarks('ws-1')).not.toContain('createPayment');

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-1', access: 'full-access' }]]);
	expect(saved.map((edit) => edit.tailored)).toEqual([
		[{ id: 'ws-1', pinned: MEMBER_WRITES - maskOf('createPayment'), granted: 0 }]
	]);
});

// a view turned off over a grant minted read only keeps it read only: the grant still clears the
// writes, and the view is set off there.
test('a view turned off over a grant minted read only keeps it read only', async () => {
	const saved: MemberEdit[] = [];

	sheet({ rows: [minted], onSave: (edit) => saved.push(edit) });

	await openTailoring('ws-1');
	await fireEvent.click(tailorSwitch('ws-1', 'viewPayment')!);
	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[]]);
	expect(saved.map((edit) => edit.tailored)).toEqual([
		[{ id: 'ws-1', pinned: maskOf('viewPayment'), granted: 0 }]
	]);
});

// review round one of the workspace layer: the owner-only rule went with the lock, so anybody who
// may grant the workspace at full access turns a write on over a grant minted read only, and
// anybody who may withdraw takes it out. Nothing is dimmed for being the owner's.
test('a grant minted read only is changed by anybody who may grant it, and taken out', async () => {
	const saved: MemberEdit[] = [];

	sheet({ rows: [minted], onSave: (edit) => saved.push(edit) });

	expect(dimmed(inSwitch('ws-1'))).toBe(false);
	expect(workspaceReasons()).toEqual([]);

	await openTailoring('ws-1');

	expect(dimmed(tailorSwitch('ws-1', 'createPayment'))).toBe(false);

	await fireEvent.click(inSwitch('ws-1')!);
	await submit();

	expect(saved.map((edit) => [edit.changes, edit.tailored])).toEqual([
		[[{ id: 'ws-1', access: 'none' }], []]
	]);
});

// full access is the reader's own credential re-sealed, so a reader holding the workspace read
// only may not turn a write back on over a grant minted read only.
test('a write over a grant minted read only is refused where the reader holds the workspace read only', async () => {
	sheet({ rows: [{ ...minted, givable: false }] });

	await openTailoring('ws-1');

	expect(dimmed(tailorSwitch('ws-1', 'createPayment'))).toBe(true);
	expect(
		document.querySelector('#access-ws-1-tailor-createPayment-reason')?.textContent?.trim()
	).toBe(en.organization.workspaceSwitches.notHeld);
	// a head with such a switch says so while folded.
	expect(tailorOpen('ws-1')!.querySelector('[data-switches-refused="payment"]')).not.toBeNull();
});

// requirement 7: a flag the reader does not hold is theirs neither to give nor to take in a
// workspace.
test('in a workspace, a flag the reader does not hold is dimmed, saying why', async () => {
	sheet({ readerPermissions: BUILT_IN.manager.mask - maskOf('editPayment') });

	await openTailoring('ws-1');

	expect(dimmed(tailorSwitch('ws-1', 'editPayment'))).toBe(true);
	expect(
		document.querySelector('#access-ws-1-tailor-editPayment-reason')?.textContent?.trim()
	).toBe(en.organization.switches.notHeld);
	expect(dimmed(tailorSwitch('ws-1', 'deletePayment'))).toBe(false);
});

// a change that would unset a flag the reader does not hold is refused at the switch that would
// make it, saying so: the row is signed under the reader's certificate.
test('in a workspace, a switch that would unset a flag the reader does not hold is refused', async () => {
	sheet({
		rows: [{ ...rows[0], pinned: maskOf('editPayment'), granted: 0 }],
		readerPermissions: BUILT_IN.manager.mask - maskOf('editPayment')
	});

	await openTailoring('ws-1');

	expect(dimmed(tailorSwitch('ws-1', 'deleteUnit'))).toBe(true);
	expect(document.querySelector('#access-ws-1-tailor-deleteUnit-reason')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.movesNotHeld
	);
});

// overrideMember: without it every switch there is dimmed, and the list says why, naming the flag,
// as the switches across the organization do.
test('without overrideMember, the permissions are drawn and refused, naming the flag', async () => {
	sheet({ canOverride: false, rows: [{ ...rows[0], pinned: maskOf('editPayment'), granted: 0 }] });

	await openTailoring('ws-1');

	const reason = en.organization.dashboard.lacksFlag.replace(
		'{flag:string}',
		en.organization.flags.overrideMember
	);
	const open = tailorOpen('ws-1')!;

	expect(open.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(reason);
	expect(
		Array.from(open.querySelectorAll('[data-switch]')).every(
			(each) => each.getAttribute('aria-disabled') === 'true'
		)
	).toBe(true);
});

// the shell clears what is set in every workspace with another role, so the card reads the same
// at once and saves nothing for them; their own role again puts it back.
test('picking another role clears what is tailored in every workspace, and their own puts it back', async () => {
	const saved: MemberEdit[] = [];

	sheet({
		rows: [{ ...rows[0], pinned: maskOf('editPayment'), granted: 0 }],
		pinned: maskOf('editPayment'),
		onSave: (edit) => saved.push(edit)
	});

	expect(tailorCustom('ws-1')).not.toBeNull();

	await openSelect(roleTrigger());
	await chooseOption(roleOption('supervisor')!);

	expect(tailorCustom('ws-1')).toBeNull();

	await submit();

	await openSelect(roleTrigger());
	await chooseOption(roleOption('member')!);

	expect(tailorCustom('ws-1')).not.toBeNull();

	await submit();

	expect(saved.map((edit) => edit.tailored)).toEqual([[], []]);
});

// review round two: switching what is changed for them back to their role by hand is the reset,
// and Rust clears every workspace's pins with it, so the switch that would do it is refused too.
test('switching back to the role by hand is refused where the reset would be', async () => {
	const saved: MemberEdit[] = [];

	sheet({
		override: maskOf('deletePayment'),
		rows: [{ ...rows[0], pinned: maskOf('deleteUnit'), granted: maskOf('deleteUnit') }],
		pinned: maskOf('deleteUnit'),
		readerPermissions: BUILT_IN.manager.mask - maskOf('deleteUnit'),
		onSave: (edit) => saved.push(edit)
	});
	await openOverride();

	expect(control('deletePayment')?.getAttribute('aria-disabled')).toBe('true');
	expect(document.querySelector('#member-override-deletePayment-reason')?.textContent?.trim()).toBe(
		en.organization.switches.resetNotHeld
	);

	await fireEvent.click(control('deletePayment')!);

	expect(isOn('deletePayment')).toBe(true);
	// another switch, which leaves something changed, is theirs to turn.
	expect(control('editUnit')?.hasAttribute('aria-disabled')).toBe(false);
});

// the hunt after ticket 59: a member with nothing changed across the organization is at their role
// already, so going back to it clears nothing and is not the reset. A switch turned and turned back
// is theirs to turn, whatever is pinned in a workspace.
test('turning a switch back is not refused where nothing was changed across the organization', async () => {
	sheet({
		override: 0,
		rows: [{ ...rows[0], pinned: maskOf('deleteUnit'), granted: maskOf('deleteUnit') }],
		pinned: maskOf('deleteUnit'),
		readerPermissions: BUILT_IN.manager.mask - maskOf('deleteUnit')
	});
	await openOverride();

	await fireEvent.click(control('deletePayment')!);
	expect(isOn('deletePayment')).toBe(true);

	expect(control('deletePayment')?.hasAttribute('aria-disabled')).toBe(false);
	await fireEvent.click(control('deletePayment')!);
	expect(isOn('deletePayment')).toBe(false);
});

// review round one: another role, or a reset to theirs, unpins what is set for the member in every
// workspace, and Rust refuses the act where a flag pinned anywhere is one the reader does not
// hold. So the pick and the reset are refused at the control, saying why, as Rust would.
test('a pick or a reset that would unpin a flag the reader does not hold is refused, saying why', async () => {
	const saved: MemberEdit[] = [];

	sheet({
		override: maskOf('renameMember'),
		rows: [{ ...rows[0], pinned: maskOf('deleteUnit'), granted: maskOf('deleteUnit') }],
		pinned: maskOf('deleteUnit'),
		readerPermissions: BUILT_IN.manager.mask - maskOf('deleteUnit'),
		onSave: (edit) => saved.push(edit)
	});

	// the reset of what is changed for them across the organization clears the workspace too.
	const reset = resetControl()!;

	expect(reset.getAttribute('aria-disabled')).toBe('true');
	expect(reset.querySelector('.sr-only')?.textContent?.trim()).toBe(
		en.organization.switches.resetNotHeld
	);

	await fireEvent.click(reset);

	expect(customMark()).not.toBeNull();

	// and so does every other role; their own clears nothing.
	await openSelect(roleTrigger());

	const reason = en.organization.foreseen.pinnedMoves.replace(
		'{flag:string}',
		flagPhrase(i18nObject('en'), 'deleteUnit')
	);

	for (const id of ['supervisor', 'collector']) {
		expect(roleOption(id)?.getAttribute('aria-disabled')).toBe('true');
		expect(roleOption(id)?.querySelector('[data-role-item-refusal]')?.textContent?.trim()).toBe(
			reason
		);
	}
	expect(roleOption('member')?.querySelector('[data-role-item-refusal]')).toBeNull();
});

// a reader holding every flag pinned may clear them: the same pick goes through.
test('a reader holding every flag pinned may give another role, clearing them', async () => {
	sheet({
		rows: [{ ...rows[0], pinned: maskOf('deleteUnit'), granted: maskOf('deleteUnit') }],
		pinned: maskOf('deleteUnit')
	});

	await openSelect(roleTrigger());

	expect(roleOption('supervisor')?.hasAttribute('data-disabled')).toBe(false);
	expect(document.querySelector('[data-role-item-refusal]')).toBeNull();
});

// ticket 50: switching a workspace back to what the member held writes nothing, so a reader
// holding it read only, who could not put them in afresh, may still turn it off and on again.
test('a reader holding a workspace read only switches the member out and back in, writing nothing', async () => {
	const saved: MemberEdit[] = [];

	sheet({ rows: [{ ...rows[0], givable: false }], onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(inSwitch('ws-1'))).toBe(false);
	expect(dimmed(inSwitch('ws-1'))).toBe(false);

	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(inSwitch('ws-1'))).toBe(true);

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[]]);
});

// grantWorkspace: a reader without it reads the workspaces, every switch dimmed, and the reason
// names the flag, as the role and what they may do say theirs.
test('without grantWorkspace the workspaces are drawn, every switch dimmed with the reason', async () => {
	sheet({ canGrantWorkspace: false });

	const reason = en.organization.dashboard.lacksFlag.replace(
		'{flag:string}',
		en.organization.flags.grantWorkspace
	);

	expect(sections()).toContain('workspaces');
	expect(workspaceReasons()).toEqual([reason]);
	expect(dimmed(inSwitch('ws-1'))).toBe(true);
	expect(dimmed(inSwitch('ws-2'))).toBe(true);

	await fireEvent.click(inSwitch('ws-1')!);
	await fireEvent.click(inSwitch('ws-2')!);

	expect(checked(inSwitch('ws-1'))).toBe(true);
	expect(checked(inSwitch('ws-2'))).toBe(false);
});

// a granter gives only what they reach: full access is their own credential re-sealed, so a
// workspace they hold read only is refused on its switch. Taking somebody out of it is still
// theirs, since a withdrawal re-seals nothing.
test('a workspace the reader holds read only is refused on its switch, and can still be withdrawn', async () => {
	sheet({
		rows: [
			{ ...rows[0], givable: false },
			{ ...rows[1], givable: false }
		]
	});

	const reason = en.organization.workspaceSwitches.notHeld;

	expect(dimmed(inSwitch('ws-2'))).toBe(true);
	expect(document.querySelector('#access-ws-2-reason')?.textContent?.trim()).toBe(reason);
	expect(workspaceReasons()).toContain(reason);

	await fireEvent.click(inSwitch('ws-2')!);
	expect(checked(inSwitch('ws-2'))).toBe(false);

	expect(dimmed(inSwitch('ws-1'))).toBe(false);
	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(inSwitch('ws-1'))).toBe(false);
});

test('the workspaces read in arabic, their permissions in their own words', async () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ rows: [minted] }, 'rtl');

	expect(tailorFold('ws-1')?.textContent).toContain(ar.organization.workspaceSwitches.permissions);
	expect(ar.organization.workspaceSwitches.permissions).not.toBe(
		en.organization.workspaceSwitches.permissions
	);
	expect(tailorCustom('ws-1')?.textContent?.trim()).toBe(ar.organization.switches.custom);
	expect(workspaceReasons()).toEqual([]);

	await openTailoring('ws-1');

	expect(document.querySelector('[data-tailor-says]')?.textContent?.trim()).toBe(
		ar.organization.workspaceSwitches.permissionsSays
	);
	expect(
		tailorOpen('ws-1')!
			.querySelector('[data-switch-row] [data-differs]')
			?.getAttribute('aria-label')
	).toBe(ar.organization.workspaceSwitches.differs);
	expect(ar.organization.workspaceSwitches.differs).not.toBe(
		en.organization.workspaceSwitches.differs
	);
	expect(document.querySelector('[data-switch-says="viewPayment"]')?.textContent?.trim()).toBe(
		ar.organization.switches.verbSays.view
	);

	setLocale('en');
});

test('the refusals read in arabic too: the flag, and a workspace the reader holds read only', () => {
	loadLocale('ar');
	setLocale('ar');

	const first = sheet({ canGrantWorkspace: false }, 'rtl');

	expect(workspaceReasons()).toEqual([
		ar.organization.dashboard.lacksFlag.replace('{flag}', ar.organization.flags.grantWorkspace)
	]);
	first.unmount();

	sheet({ rows: [{ ...rows[1], givable: false }] }, 'rtl');

	expect(workspaceReasons()).toEqual([ar.organization.workspaceSwitches.notHeld]);

	setLocale('en');
});

// one save, and the acts it runs handed back together; the workspaces only where they changed.
test('one save hands back the role, the override and the workspaces that changed', async () => {
	const saved: unknown[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });
	await openOverride();

	await fireEvent.click(inSwitch('ws-2')!);
	await turn('deletePayment');
	await submit();

	expect(saved).toEqual([
		{
			username: 'ada',
			roleId: 'member',
			override: maskOf('deletePayment'),
			changes: [{ id: 'ws-2', access: 'full-access' }],
			tailored: []
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
// and the workspaces for every reader since ticket 48 of effort 838, refused without
// grantWorkspace.
test('the name is the first section, drawn by renameMember and opened on the name they hold', () => {
	const renaming = sheet({ canRename: true });

	expect(sections()).toEqual(['name', 'role', 'override', 'workspaces']);
	expect(usernameInput()?.value).toBe('ada');
	renaming.unmount();

	sheet({ canRename: false, canGrantWorkspace: false });

	expect(sections()).toEqual(['role', 'override', 'workspaces']);
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

test('and in arabic every sentence reads in its own words, right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ override: maskOf('editPayment') }, 'rtl');
	await openOverride();

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.override.legend)).toBeDefined();
	expect(ar.organization.override.legend).not.toBe(en.organization.override.legend);
	expect(tray('member-role-tray')?.textContent).toContain(ar.organization.roles.member.who);
	expect(roleTrigger().textContent).toContain(ar.layout.signIn.roleMember);
	// custom, and the reset back to the role, in the reader's words.
	expect(customMark()?.textContent?.trim()).toBe(ar.organization.switches.custom);
	expect(resetControl()?.textContent?.trim()).toBe(
		ar.organization.switches.reset.replace('{role}', ar.layout.signIn.roleMember)
	);
	expect(control('editPayment')?.getAttribute('aria-label')).toBe(
		`${ar.organization.flagVerbs.edit} ${ar.organization.families.payment}`
	);

	setLocale('en');
});
