import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Roles from '$lib/organization/component/roles.svelte';
import { organizationHostState, resetOrganizationHost } from '$lib/organization/host.svelte';
import {
	fakeOrganizationMember,
	fakeOrganizationRole,
	fakeOrganizationRoles,
	fakeOrganizationSession
} from '$lib/platform/tests/testing';
import type { OrganizationMember, OrganizationRole } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { expectCreateControlLast } from '$lib/design/tests/create-control';
import { BAR_CONTROL, expectBarOrder } from '$lib/design/tests/set-bar';
import {
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from '$lib/design/tests/search';
import type { RoleReader } from '$lib/organization/acts';
import { BUILT_IN, maskOf, type Flag } from '@rentable/workspace-permission';

import { layOutLists } from '#tests/permission.ts';

import { hostAnswers, resetHostAnswers } from './host-hooks';
import HostProviders from './host-providers.svelte';

/**
 * THE ROLES, AS A LIST OF CARDS, AND THE EDITOR THEY OPEN
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] from the
 * organization section's side: the roles by rank, each summed by kind of record and level,
 * and every write a holder of `manageRoles` makes through the card's acts and the editor they
 * open. A write is read off what the organization host asked of its hooks (`./host-hooks.ts`),
 * and what each hook asks of the shell is `platform/tests/roles.test.ts`'s.
 *
 * **A control the reader may not use says why**: the flag they lack, or a role not below them.
 * A card's act is read through its menu, the way `members.svelte.test.ts` reads a member's, and
 * its reason through the tooltip its entry opens on focus.
 */

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('./host-hooks')).hostHooks
}));

const { address } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings?section=organization') }
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return address.url;
		}
	}
}));

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async (to: string) => {
		address.url = new URL(to, 'http://localhost');
	}
}));

const OWNER: RoleReader = {
	rank: BUILT_IN.owner.rank,
	canManageRoles: true,
	permissions: BUILT_IN.owner.mask
};

const block = (reader = OWNER, answersSearchKey?: boolean, members: OrganizationMember[] = []) =>
	render(
		Roles,
		{ roles: fakeOrganizationRoles(), members, reader, answersSearchKey },
		{ wrapper: HostProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const card = (id: string) => document.querySelector(`[data-role="${id}"]`);
const control = (id: string) => card(id)?.querySelector<HTMLButtonElement>('button') ?? null;
const entry = (act: string) =>
	document.querySelector<HTMLElement>(`[data-slot=dropdown-menu-item][data-act="${act}"]`);
const surface = () => document.querySelector('[data-slot=form-surface]');

/** open a role's card and hand back one act's entry. */
const openTo = async (id: string, act: string) => {
	await fireEvent.click(control(id)!);

	return entry(act);
};

/** the reason an unavailable entry gives, read through the tooltip it opens on focus. */
const reasonOf = async (target: HTMLElement) => {
	layOutLists();

	await fireEvent.focus(target);

	return await waitFor(() => {
		const drawn = document.querySelector('[data-slot=tooltip-content]');

		expect(drawn).not.toBeNull();

		return drawn?.textContent ?? '';
	});
};

const written = (hook: string) =>
	hostAnswers.writes.filter((write) => write.hook === hook).map((write) => write.input);

beforeEach(() => {
	resetOrganizationHost();
	resetHostAnswers();
	hostAnswers.session = fakeOrganizationSession({ permissions: BUILT_IN.owner.mask });
	hostAnswers.roles = fakeOrganizationRoles();
	address.url = new URL('http://localhost/settings?section=organization');
	loadLocale('en');
	setLocale('en');
});

// requirement 12: the roles by rank, highest first, and each built-in role named in the reader's
// language while a role the organization made is called what it was named.
test('the roles are listed by rank, the owner first and the member last', () => {
	block();

	expect(
		Array.from(document.querySelectorAll('[data-role]')).map((role) =>
			role.getAttribute('data-role')
		)
	).toEqual(['owner', 'manager', 'supervisor', 'collector', 'member']);
	expect(card('owner')?.querySelector('[data-role-name]')?.textContent?.trim()).toBe(
		en.layout.signIn.roleOwner
	);
	expect(card('manager')?.querySelector('[data-role-name]')?.textContent?.trim()).toBe(
		en.layout.signIn.roleManager
	);
	expect(card('collector')?.querySelector('[data-role-name]')?.textContent?.trim()).toBe(
		'collector'
	);
	expect(card('collector')?.querySelector('[data-role-holders]')?.textContent?.trim()).toBe(
		'held by 2 members'
	);
	expect(card('supervisor')?.querySelector('[data-role-holders]')?.textContent?.trim()).toBe(
		en.organization.roleList.heldByNobody
	);
});

// requirement 12 as amended 2026-09-27: a card sums the role by kind of record, a line per level,
// each kind under its glyph; a kind it cannot see is left out, the owner reads everything, and a
// short line counts the organization's ten where the role holds any.

/** a card's lines: each level's words and the kinds on it. */
const levels = (id: string) =>
	Array.from(card(id)!.querySelectorAll('[data-role-level]')).map((line) => ({
		level: line.getAttribute('data-role-level'),
		word: line.querySelector('[data-role-level-word]')?.textContent?.trim(),
		kinds: Array.from(line.querySelectorAll('[data-role-kind-line]')).map((kind) =>
			kind.getAttribute('data-role-kind-line')
		)
	}));

/** the administration line, as it reads, or `null` where the card has none. */
const administers = (id: string) =>
	card(id)?.querySelector('[data-role-administers]')?.textContent?.replace(/\s+/g, ' ').trim() ??
	null;

const EVERY_KIND = ['complex', 'unit', 'tenant', 'contract', 'payment'];

/**
 * render the block over the roles every organization has and these beside them, in a language,
 * as the block is drawn in it.
 */
const blockOf = (roles: OrganizationRole[], language: 'en' | 'ar' = 'en') => {
	loadLocale(language);
	setLocale(language);

	return render(
		Roles,
		{ roles: [...fakeOrganizationRoles(), ...roles], reader: OWNER },
		{
			wrapper: HostProviders,
			wrapperProps: { strings, direction: language === 'ar' ? ('rtl' as const) : ('ltr' as const) }
		}
	);
};

/** a custom role carrying these flags alone. */
const custom = (id: string, flags: Flag[]) =>
	fakeOrganizationRole({ id, mask: flags.reduce((mask, flag) => mask + maskOf(flag), 0) });

test('the owner reads everything, under its crown, and nothing else', () => {
	block();

	expect(card('owner')?.querySelector('[data-role-everything]')?.textContent?.trim()).toBe(
		en.organization.roleCard.everything
	);
	expect(card('owner')?.querySelector('[data-role-everything] svg')).not.toBeNull();
	expect(levels('owner')).toEqual([]);
	expect(administers('owner')).toBeNull();
});

test('the manager has full access to every kind, and administers all ten', () => {
	block();

	expect(levels('manager')).toEqual([
		{ level: 'full', word: en.organization.dashboard.accessFull, kinds: EVERY_KIND }
	]);
	expect(administers('manager')).toBe(`${en.organization.roleCard.administers} 10 of 10`);
	expect(card('manager')?.querySelector('[data-role-administers] svg')).not.toBeNull();
	expect(card('manager')?.querySelector('[data-role-everything]')).toBeNull();
});

test('the member can edit every kind, and administers nothing, so says nothing of it', () => {
	block();

	expect(levels('member')).toEqual([
		{ level: 'edit', word: en.organization.roleCard.edit, kinds: EVERY_KIND }
	]);

	// every kind carries its glyph beside its name, never the glyph alone.
	const complexes = card('member')!.querySelector('[data-role-kind-line="complex"]')!;

	expect(complexes.querySelector('svg')).not.toBeNull();
	expect(complexes.textContent?.trim()).toBe(en.organization.families.complex);
	expect(administers('member')).toBeNull();
});

test('a custom role reads each level it has, widest first, leaving out what it cannot see', () => {
	blockOf([
		custom('clerk', [
			'viewComplex',
			'createComplex',
			'editComplex',
			'deleteComplex',
			'viewUnit',
			'createUnit',
			'editUnit',
			'viewTenant',
			'createTenant',
			'viewContract',
			'inviteMember',
			'manageRoles'
		])
	]);

	expect(levels('clerk')).toEqual([
		{ level: 'full', word: en.organization.dashboard.accessFull, kinds: ['complex'] },
		{ level: 'edit', word: en.organization.roleCard.edit, kinds: ['unit'] },
		{ level: 'add', word: en.organization.roleCard.add, kinds: ['tenant'] },
		{ level: 'view', word: en.organization.roleCard.view, kinds: ['contract'] }
	]);
	// payments it cannot see, so they are not on the card.
	expect(card('clerk')?.querySelector('[data-role-kind-line="payment"]')).toBeNull();
	expect(administers('clerk')).toBe(`${en.organization.roleCard.administers} 2 of 10`);
});

test('a mix off the ladder reads as the verbs it carries, and a role of nothing says so', () => {
	blockOf([
		custom('auditor', ['viewPayment', 'deletePayment', 'viewTenant', 'deleteTenant']),
		custom('empty', [])
	]);

	expect(levels('auditor')).toEqual([
		{ level: 'mixed', word: 'view, delete', kinds: ['tenant', 'payment'] }
	]);
	expect(card('empty')?.querySelector('[data-role-carries-nothing]')?.textContent?.trim()).toBe(
		en.organization.roleList.carriesNothing
	);
	expect(levels('empty')).toEqual([]);
});

test('in Arabic, the card reads the same levels in Arabic words', () => {
	blockOf([custom('clerk', ['viewTenant', 'createTenant', 'viewContract', 'inviteMember'])], 'ar');

	expect(card('owner')?.querySelector('[data-role-everything]')?.textContent?.trim()).toBe(
		ar.organization.roleCard.everything
	);
	expect(levels('manager')).toEqual([
		{ level: 'full', word: ar.organization.dashboard.accessFull, kinds: EVERY_KIND }
	]);
	expect(levels('member')).toEqual([
		{ level: 'edit', word: ar.organization.roleCard.edit, kinds: EVERY_KIND }
	]);
	expect(levels('clerk')).toEqual([
		{ level: 'add', word: ar.organization.roleCard.add, kinds: ['tenant'] },
		{ level: 'view', word: ar.organization.roleCard.view, kinds: ['contract'] }
	]);
	expect(card('clerk')?.querySelector('[data-role-kind-line="tenant"]')?.textContent?.trim()).toBe(
		ar.organization.families.tenant
	);
	expect(administers('clerk')).toBe(`${ar.organization.roleCard.administers} 1 من 10`);
	expect(administers('member')).toBeNull();
});

// requirement 4: making a role is the block's one create, and the editor it opens writes the name
// and the flags ticked, placed just above the member.
test('the create opens the editor, and adding the role writes it just above the member', async () => {
	block();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-role-add]')!);

	expect(surface()).not.toBeNull();
	// a new role opens on what a member carries, as the switch list grouped by kind, the owner's
	// acts a line rather than switches.
	expect(
		Array.from(document.querySelectorAll('[data-switches-group]')).map((group) =>
			group.getAttribute('data-switches-group')
		)
	).toEqual(['complex', 'unit', 'tenant', 'contract', 'payment', 'administration']);
	expect(document.querySelector('#role-flag-viewComplex')?.getAttribute('aria-checked')).toBe(
		'true'
	);
	expect(document.querySelector('#role-flag-lockOut')).toBeNull();
	expect(document.querySelector('[data-switches-owner]')).not.toBeNull();
	// the checkboxes and the sentence explaining them are gone.
	expect(document.querySelector('[data-role-editor] [data-slot=checkbox]')).toBeNull();
	// compared against nothing: a role is what it is.
	expect(document.querySelector('[data-differs]')).toBeNull();

	await fireEvent.input(document.querySelector<HTMLInputElement>('input[name=role-name]')!, {
		target: { value: ' bookkeeper ' }
	});
	await fireEvent.click(document.querySelector<HTMLElement>('#role-flag-deletePayment')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useCreateRole')).toEqual([
			{
				name: 'bookkeeper',
				mask: BUILT_IN.member.mask + maskOf('deletePayment'),
				afterRoleId: 'collector'
			}
		]);
	});
	await waitFor(() => {
		expect(surface()).toBeNull();
	});
});

// and a role with no name is refused on its field before anything is written.
test('a role with no name is refused on its name', async () => {
	block();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-role-add]')!);
	await fireEvent.submit(document.querySelector('form')!);

	expect(document.querySelector('[data-sheet-error="name"]')?.textContent?.trim()).toBe(
		en.common.refusals.host.roleNameMissing
	);
	expect(written('useCreateRole')).toEqual([]);
});

// requirement 4: the edit renames a custom role and changes what it carries, each through its own
// write; a built-in role keeps the name the interface gives it.
test('the edit renames a role and changes what it carries, each through its own write', async () => {
	block();

	await fireEvent.click((await openTo('collector', 'role.edit'))!);

	expect(document.querySelector<HTMLInputElement>('input[name=role-name]')?.value).toBe(
		'collector'
	);

	await fireEvent.input(document.querySelector<HTMLInputElement>('input[name=role-name]')!, {
		target: { value: 'cashier' }
	});
	await fireEvent.click(document.querySelector<HTMLElement>('#role-flag-editPayment')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useRenameRole')).toEqual([{ roleId: 'collector', name: 'cashier' }]);
	});
	expect(written('useSetRoleMask')).toEqual([
		{ roleId: 'collector', mask: BUILT_IN.member.mask - maskOf('editPayment') }
	]);
});

test('a built-in role is edited for what it carries and keeps its name', async () => {
	block();

	await fireEvent.click((await openTo('member', 'role.edit'))!);

	expect(document.querySelector('input[name=role-name]')).toBeNull();
	expect(document.querySelector('[data-role-fixed-name]')?.textContent?.trim()).toBe(
		en.layout.signIn.roleMember
	);

	await fireEvent.click(document.querySelector<HTMLElement>('#role-flag-deleteTenant')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useSetRoleMask')).toEqual([
			{ roleId: 'member', mask: BUILT_IN.member.mask + maskOf('deleteTenant') }
		]);
	});
	expect(written('useRenameRole')).toEqual([]);
});

// requirement 4: re-ranking is one place up or down from the card, placed directly below the role
// it passes.
test('moving a role up or down places it directly below the role it passes', async () => {
	block();

	await fireEvent.click((await openTo('collector', 'role.moveUp'))!);
	await waitFor(() => {
		expect(written('useMoveRole')).toEqual([{ roleId: 'collector', afterRoleId: 'manager' }]);
	});

	await fireEvent.click((await openTo('supervisor', 'role.moveDown'))!);
	await waitFor(() => {
		expect(written('useMoveRole')).toEqual([
			{ roleId: 'collector', afterRoleId: 'manager' },
			{ roleId: 'supervisor', afterRoleId: 'collector' }
		]);
	});
});

// requirement 4: deleting asks first, saying its holders become members, and then writes.
test('deleting a role asks first, then writes', async () => {
	block();

	await fireEvent.click((await openTo('collector', 'role.delete'))!);

	expect(organizationHostState.role.deleting?.role.id).toBe('collector');
	expect(document.body.textContent).toContain(en.organization.roleList.deleteDescription);
	expect(written('useDeleteRole')).toEqual([]);

	const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
		(button) => button.textContent?.trim() === en.organization.roleList.deleteTitle
	)!;

	await fireEvent.click(confirm);

	await waitFor(() => {
		expect(written('useDeleteRole')).toEqual([{ roleId: 'collector' }]);
	});
});

// the flag: a reader without manageRoles reads every role, and every act and the create are drawn
// refused, naming the flag.
test('a reader without manageRoles is refused every act, naming the flag', async () => {
	const reason = en.organization.dashboard.lacksFlag.replace(
		'{flag:string}',
		en.organization.flags.manageRoles
	);

	block({ rank: 0, canManageRoles: false, permissions: BUILT_IN.member.mask });

	const edit = (await openTo('collector', 'role.edit'))!;

	expect(edit.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(edit)).toContain(reason);
	await fireEvent.click(edit);
	expect(organizationHostState.role.editing).toBeNull();
	expect(entry('role.delete')?.getAttribute('aria-disabled')).toBe('true');
	await fireEvent.click(control('collector')!);

	const add = document.querySelector<HTMLElement>('[data-role-add]')!;

	expect(add.getAttribute('aria-disabled')).toBe('true');
	await fireEvent.click(add);
	expect(organizationHostState.role.creating).toBe(false);
});

// the rank: a reader in the supervisor's role changes the roles below it and none at or above.
test('a role not below the reader is refused, saying so', async () => {
	block({ rank: 750_000, canManageRoles: true, permissions: BUILT_IN.manager.mask });

	const edit = (await openTo('supervisor', 'role.edit'))!;

	expect(edit.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(edit)).toContain(en.organization.roleList.notBelowYou);
	await fireEvent.click(control('supervisor')!);

	expect((await openTo('collector', 'role.edit'))?.getAttribute('aria-disabled')).not.toBe('true');
});

// the flag again, inside the editor: a flag the reader does not hold is theirs neither to give a
// role nor to take from it, so its switch is dimmed, saying why, and the list says so once.
test('in the editor, a flag the reader does not hold is refused at its switch', async () => {
	hostAnswers.session = fakeOrganizationSession({
		permissions: BUILT_IN.manager.mask - maskOf('deleteContract')
	});
	block({
		rank: BUILT_IN.manager.rank,
		canManageRoles: true,
		permissions: BUILT_IN.manager.mask - maskOf('deleteContract')
	});

	await fireEvent.click((await openTo('collector', 'role.edit'))!);

	expect(document.querySelector('#role-flag-deleteContract')?.getAttribute('aria-disabled')).toBe(
		'true'
	);
	expect(document.querySelector('#role-flag-deleteContract-reason')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);
	expect(document.querySelector('[data-switches-refusal]')?.textContent?.trim()).toBe(
		en.organization.switches.notHeld
	);
	expect(document.querySelector('#role-flag-deletePayment')?.hasAttribute('aria-disabled')).toBe(
		false
	);
});

// ticket 45: a new role is made of flags its maker holds, so it opens on the member's less the ones
// the maker does not hold, and saving it untouched is not refused.
test('a new role opens on the member flags less the ones its maker does not hold', async () => {
	const held = BUILT_IN.manager.mask - maskOf('editPayment');

	hostAnswers.session = fakeOrganizationSession({ permissions: held });
	block({ rank: BUILT_IN.manager.rank, canManageRoles: true, permissions: held });

	await fireEvent.click(document.querySelector<HTMLElement>('[data-role-add]')!);

	expect(document.querySelector('#role-flag-editPayment')?.getAttribute('aria-checked')).toBe(
		'false'
	);
	expect(document.querySelector('#role-flag-viewPayment')?.getAttribute('aria-checked')).toBe(
		'true'
	);

	await fireEvent.input(document.querySelector<HTMLInputElement>('input[name=role-name]')!, {
		target: { value: 'cashier' }
	});
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useCreateRole')).toEqual([
			{
				name: 'cashier',
				mask: BUILT_IN.member.mask - maskOf('editPayment'),
				afterRoleId: 'collector'
			}
		]);
	});
});

/** lina holds the collector's role, with deleting tenants switched on for her alone. */
const lina = fakeOrganizationMember({
	id: 'lina',
	username: 'lina',
	role: 'custom',
	roleId: 'collector',
	override: maskOf('deleteTenant')
});

// ticket 45, requirements 6 and 7: deleting a role gives its holders the member role exactly, so
// lina loses deleting tenants; a reader who does not hold it may not take it, and the delete says
// so, naming her and the flag, before anything is asked.
test('a delete that would move a holder flag the reader does not hold is refused, naming both', async () => {
	const held = BUILT_IN.manager.mask - maskOf('deleteTenant');

	block({ rank: BUILT_IN.manager.rank, canManageRoles: true, permissions: held }, undefined, [
		lina
	]);

	const remove = (await openTo('collector', 'role.delete'))!;

	expect(remove.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(remove)).toContain(
		en.organization.foreseen.deleteMoves
			.replace('{username:string}', 'lina')
			.replace(
				'{flag:string}',
				`${en.organization.flagVerbs.delete} ${en.organization.families.tenant}`
			)
	);
	await fireEvent.click(remove);
	expect(organizationHostState.role.deleting).toBeNull();
});

// ticket 45, requirement 6 as amended: turning the collector's view of tenants off would leave
// lina deleting tenants she cannot see, which Rust refuses on save; the switch says so first,
// naming her, and the way on.
test('in the editor, a view a holder needs is refused at its switch, naming the holder', async () => {
	block(OWNER, undefined, [lina]);

	await fireEvent.click((await openTo('collector', 'role.edit'))!);

	const view = document.querySelector<HTMLElement>('#role-flag-viewTenant')!;

	expect(view.getAttribute('aria-disabled')).toBe('true');
	expect(document.querySelector('#role-flag-viewTenant-reason')?.textContent?.trim()).toBe(
		en.organization.foreseen.holdersBlind.replace('{names:string}', 'lina')
	);

	await fireEvent.click(view);

	expect(view.getAttribute('aria-checked')).toBe('true');
	// a kind her own change does not reach is the reader's to turn.
	expect(document.querySelector('#role-flag-viewPayment')?.hasAttribute('aria-disabled')).toBe(
		false
	);
});

// [[rules/interface]], *Row activation*, and its noted deviation for the settings directories: a
// card opens its record, and a role's page is its editor, on this section's address.
test('a card opens its role on the section address', () => {
	block();

	expect(card('collector')?.querySelector('a')?.getAttribute('href')).toContain(
		'section=organization&role=collector'
	);
});

test('the address naming a role opens its editor, and is cleared', async () => {
	address.url = new URL('http://localhost/settings?section=organization&role=collector');
	block();

	await waitFor(() => {
		expect(organizationHostState.role.editing?.role.id).toBe('collector');
	});
	expect(address.url.searchParams.get('role')).toBeNull();
});

// --- The bar: search, order and create ([[rules/interface]], *Search*, *Sort* and *Create*) ------

/** the roles the block is showing, by id, in the order it shows them. */
const shownRoles = () =>
	Array.from(document.querySelectorAll('[data-role]')).map((role) =>
		role.getAttribute('data-role')
	);

/** choose one of the orders the bar's sort control offers. */
const orderBy = async (label: string) => {
	// named for the order it holds once one is chosen, so it is found by the words it starts with.
	await fireEvent.click(
		screen.getByRole('button', { name: new RegExp(`^${en.common.actions.sortBy}`) })
	);

	const item = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).find(
		(offered) => offered.textContent?.trim() === label
	);

	await fireEvent.click(item!);
};

// ticket 19 of effort 838: the block opens with the settings directories' tray, and its bar is the
// list shell's, in the list shell's order, with the create last.
test('the block opens with the directory bar: search, count, order, and the create last', () => {
	block();

	const tray = document.querySelector('[data-directory-tray]')!;

	expect(tray.querySelector('#roles-legend')?.textContent?.trim()).toBe(
		en.organization.roleList.title
	);
	expect(tray.contains(searchField())).toBe(true);
	expect(searchGlass()).not.toBeNull();
	expectBarOrder([BAR_CONTROL.search, BAR_CONTROL.count, BAR_CONTROL.sort, BAR_CONTROL.create]);
	expectCreateControlLast();
	expect(document.querySelector('[data-role-add]')?.hasAttribute('data-create-control')).toBe(true);
});

test('a role is found by its name, and a search that finds none says so', async () => {
	block();

	await typeSearch('coll');
	await pastTheWait();
	expect(shownRoles()).toEqual(['collector']);

	// a built-in role is found by what the reader's language calls it.
	await typeSearch(en.layout.signIn.roleManager);
	await pastTheWait();
	expect(shownRoles()).toEqual(['manager']);

	await typeSearch('nothing-called-this');
	await pastTheWait();
	expect(shownRoles()).toEqual([]);
	expect(
		document.querySelector('[data-directory-no-match] [data-empty]')?.getAttribute('data-empty')
	).toBe('no-match');
});

test('the order is the rank until another is chosen, and the name is the other', async () => {
	block();

	expect(shownRoles()).toEqual(['owner', 'manager', 'supervisor', 'collector', 'member']);

	await orderBy(en.common.labels.name);
	// the built-in roles are ordered by what the reader's language calls them.
	expect(shownRoles()).toEqual(['collector', 'manager', 'member', 'owner', 'supervisor']);

	await orderBy(en.organization.roleList.rank);
	expect(shownRoles()).toEqual(['owner', 'manager', 'supervisor', 'collector', 'member']);

	await orderBy(en.organization.roleList.rank);
	expect(shownRoles()).toEqual(['member', 'collector', 'supervisor', 'manager', 'owner']);
});

// a section answers the search key once: where the members directory is drawn beside the roles,
// the key is that directory's, and the roles field is reached by pointer or tab.
test('the search key reaches the roles field unless the section gives it to the people', async () => {
	block();
	await pressSearchKey();
	expect(document.activeElement).toBe(searchField());

	cleanup();
	block(OWNER, false);
	await pressSearchKey();
	expect(document.activeElement).not.toBe(searchField());
});
