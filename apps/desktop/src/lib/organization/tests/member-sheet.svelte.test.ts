import { fireEvent, render, screen } from '@testing-library/svelte';
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

import Providers from './providers.svelte';

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
	{ id: 'ws-1', name: 'Riyadh', access: 'full-access' as const, givable: true },
	{ id: 'ws-2', name: 'Jeddah', access: 'none' as const, givable: true }
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

/** a workspace's switch, the lock beneath it, and whether either is on or dimmed. */
const inSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}`);
const lockSwitch = (id: string) => document.querySelector<HTMLElement>(`#access-${id}-lock`);
const checked = (element: HTMLElement | null) => element?.getAttribute('aria-checked') === 'true';
const dimmed = (element: HTMLElement | null) => element?.getAttribute('aria-disabled') === 'true';
const workspaceReasons = () =>
	Array.from(document.querySelectorAll('[data-access-refusal]')).map((line) =>
		line.textContent?.trim()
	);

/** the role's chooser, and each role it offers once opened. */
const roleTrigger = () => document.querySelector<HTMLElement>('#member-role')!;
const roleOption = (id: string) =>
	document.querySelector<HTMLElement>(`[data-slot=select-item][data-role="${id}"]`);

/** a flag's switch, whether it is on, and a press on it. */
const control = (flag: string) => document.querySelector<HTMLElement>(`#member-override-${flag}`);
const isOn = (flag: string) => control(flag)?.getAttribute('aria-checked') === 'true';

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

	expect(customMark()).toBeNull();
	expect(resetControl()).toBeNull();

	await turn('editPayment');
	await turn('deletePayment');
	await submit();

	expect(saved.map((edit) => edit.override)).toEqual([maskOf('editPayment', 'deletePayment')]);
});

// requirement 6 as amended: turning a kind's view off turns its writes off with it, and hides
// them; what is saved is the override that takes all three away.
test('turning a view off turns its add, edit and delete off, and hides them', async () => {
	const saved: { override: number }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	expect(document.querySelector('[data-switches-writes="contract"]')).not.toBeNull();

	await turn('viewContract');

	expect(isOn('viewContract')).toBe(false);
	expect(document.querySelector('[data-switches-writes="contract"]')).toBeNull();

	await submit();

	expect(saved.map((edit) => edit.override)).toEqual([
		maskOf('viewContract', 'createContract', 'editContract')
	]);
});

// the reset clears the override: the member is their role exactly again, and reads so.
test('reset puts them back on their role exactly', async () => {
	const saved: { override: number }[] = [];

	sheet({ override: maskOf('editPayment', 'deleteTenant'), onSave: (edit) => saved.push(edit) });

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

	const refused = control('deletePayment')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('disabled')).toBe(false);
	expect(refused.getAttribute('aria-describedby')).toBe('member-override-deletePayment-reason');
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
test('a section whose flag the reader lacks is drawn, refused, naming the flag', () => {
	sheet({ canAssignRole: false, canOverride: false });

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

// ticket 48 of effort 838, requirement 12 as amended again 2026-09-27: a workspace is one switch,
// in or out, and no level is offered beside the role. The lock sits under a workspace the member
// is in, and nowhere else, with what it means under its name.
test('each workspace is one switch, in or out, with the lock beneath one that is in', () => {
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

	// the lock, off, under the workspace they are in, and not under the one they are out of.
	expect(checked(lockSwitch('ws-1'))).toBe(false);
	expect(lockSwitch('ws-1')?.getAttribute('data-size')).toBe('sm');
	expect(lockSwitch('ws-2')).toBeNull();
	expect(document.querySelector('[data-access-lock-row="ws-1"]')?.textContent).toContain(
		en.organization.workspaceSwitches.lock
	);
	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.locked
	);

	// the level words have left the card, and no segment is drawn.
	const words = section('workspaces')?.textContent ?? '';

	expect(words).not.toContain(en.organization.dashboard.accessFull);
	expect(words).not.toContain('no access');
	expect(document.querySelector('[data-access-row] [data-slot=toggle-group-item]')).toBeNull();
	// the owner reading, so nothing is dimmed and no reason is said.
	expect(workspaceReasons()).toEqual([]);
});

// in: switching a workspace on is a full-access grant, and the lock appears under it.
test('switching a workspace on puts them in it at full access', async () => {
	const saved: { changes: unknown }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-2')!);

	expect(checked(inSwitch('ws-2'))).toBe(true);
	expect(lockSwitch('ws-2')).not.toBeNull();

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-2', access: 'full-access' }]]);
});

// out: switching it off withdraws it, and the lock goes with it.
test('switching a workspace off takes them out of it', async () => {
	const saved: { changes: unknown }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-1')!);

	expect(checked(inSwitch('ws-1'))).toBe(false);
	expect(lockSwitch('ws-1')).toBeNull();

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-1', access: 'none' }]]);
});

// lock: the owner locks a workspace to read only, which grants it again read only.
test('locking a workspace grants it read only', async () => {
	const saved: { changes: unknown }[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(lockSwitch('ws-1')!);

	expect(checked(lockSwitch('ws-1'))).toBe(true);
	expect(checked(inSwitch('ws-1'))).toBe(true);

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-1', access: 'read-only' }]]);
});

// unlock: a workspace held read only, unlocked, is granted again at full access. Switched off and
// on again, it is back to what it held, and nothing is written.
test('unlocking grants full access again, and off and on again changes nothing', async () => {
	const saved: { changes: unknown }[] = [];
	const locked = [{ id: 'ws-1', name: 'Riyadh', access: 'read-only' as const, givable: true }];

	const first = sheet({ rows: locked, onSave: (edit) => saved.push(edit) });

	expect(checked(lockSwitch('ws-1'))).toBe(true);

	await fireEvent.click(lockSwitch('ws-1')!);
	expect(checked(lockSwitch('ws-1'))).toBe(false);
	await submit();

	first.unmount();
	sheet({ rows: locked, onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-1')!);
	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(lockSwitch('ws-1'))).toBe(true);
	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[{ id: 'ws-1', access: 'full-access' }], []]);
});

// requirement 5 of effort 826: only the owner's Turso account mints a read-only credential, so for
// anybody else the lock is drawn dimmed with the reason, never hidden, and a lock already on
// stays on.
test('for anybody but the owner the lock is dimmed and says why', async () => {
	const saved: { changes: unknown }[] = [];

	sheet({
		canGrantReadOnly: false,
		rows: [
			{ id: 'ws-1', name: 'Riyadh', access: 'full-access' as const, givable: true },
			{ id: 'ws-2', name: 'Jeddah', access: 'read-only' as const, givable: true }
		],
		onSave: (edit) => saved.push(edit)
	});

	const reason = en.organization.workspaceSwitches.lockIsTheOwners;

	expect(dimmed(lockSwitch('ws-1'))).toBe(true);
	expect(dimmed(lockSwitch('ws-2'))).toBe(true);
	expect(checked(lockSwitch('ws-2'))).toBe(true);
	expect(document.querySelector('#access-ws-1-lock-reason')?.textContent?.trim()).toBe(reason);
	expect(workspaceReasons()).toEqual([reason]);
	// the workspace itself is still theirs to switch.
	expect(dimmed(inSwitch('ws-1'))).toBe(false);

	await fireEvent.click(lockSwitch('ws-1')!);
	await fireEvent.click(lockSwitch('ws-2')!);

	expect(checked(lockSwitch('ws-1'))).toBe(false);
	expect(checked(lockSwitch('ws-2'))).toBe(true);

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[]]);
});

// ticket 50: switching a workspace back to what the member held writes nothing, so a reader
// holding it read only, who could not put them in afresh, may still turn it off and on again.
test('a reader holding a workspace read only switches the member out and back in, writing nothing', async () => {
	const saved: { changes: unknown }[] = [];

	sheet({
		canGrantReadOnly: false,
		rows: [{ id: 'ws-1', name: 'Riyadh', access: 'full-access' as const, givable: false }],
		onSave: (edit) => saved.push(edit)
	});

	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(inSwitch('ws-1'))).toBe(false);
	expect(dimmed(inSwitch('ws-1'))).toBe(false);

	await fireEvent.click(inSwitch('ws-1')!);
	expect(checked(inSwitch('ws-1'))).toBe(true);

	await submit();

	expect(saved.map((edit) => edit.changes)).toEqual([[]]);
});

// the owner on a machine without the Turso authority, where Rust refuses a read-only grant: the
// lock is dimmed with the sentence that says this machine is not connected.
test('for the owner on a machine without the Turso authority the lock says so', () => {
	sheet({ canGrantReadOnly: false, readerIsOwner: true });

	const reason = en.common.refusals.host.tursoNotConnected;

	expect(dimmed(lockSwitch('ws-1'))).toBe(true);
	expect(workspaceReasons()).toEqual([reason]);
	expect(lockSwitch('ws-1')?.getAttribute('aria-describedby')).toBe(
		'access-ws-1-lock-says access-ws-1-lock-reason'
	);
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
	expect(dimmed(lockSwitch('ws-1'))).toBe(true);

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
		canGrantReadOnly: false,
		rows: [
			{ id: 'ws-1', name: 'Riyadh', access: 'full-access' as const, givable: false },
			{ id: 'ws-2', name: 'Jeddah', access: 'none' as const, givable: false }
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

test('the workspaces read in arabic, the lock and its reason in their own words', () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ canGrantReadOnly: false }, 'rtl');

	expect(document.querySelector('[data-access-says="ws-1"]')?.textContent?.trim()).toBe(
		ar.organization.workspaceSwitches.locked
	);
	expect(ar.organization.workspaceSwitches.locked).not.toBe(
		en.organization.workspaceSwitches.locked
	);
	expect(workspaceReasons()).toEqual([ar.organization.workspaceSwitches.lockIsTheOwners]);
	expect(lockSwitch('ws-1')?.getAttribute('aria-label')).toBe(
		ar.organization.workspaceSwitches.lockNamed.replace('{workspace}', 'Riyadh')
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

	sheet({ rows: [{ id: 'ws-2', name: 'Jeddah', access: 'none' as const, givable: false }] }, 'rtl');

	expect(workspaceReasons()).toEqual([ar.organization.workspaceSwitches.notHeld]);

	setLocale('en');
});

// one save, and the acts it runs handed back together; the workspaces only where they changed.
test('one save hands back the role, the override and the workspaces that changed', async () => {
	const saved: unknown[] = [];

	sheet({ onSave: (edit) => saved.push(edit) });

	await fireEvent.click(inSwitch('ws-2')!);
	await turn('deletePayment');
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

test('and in arabic every sentence reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ override: maskOf('editPayment') }, 'rtl');

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
