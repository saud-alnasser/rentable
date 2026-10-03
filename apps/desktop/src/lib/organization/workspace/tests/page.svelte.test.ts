import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { back } from '@rentable/design/back.svelte.js';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspacePage from '$lib/organization/workspace/component/page.svelte';
import { resetOrganizationHost } from '$lib/organization/host.svelte';
import { fakeOrganizationMember, fakeOrganizationSession } from '$lib/organization/tests/testing';
import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import { lacking } from '$lib/organization/role/acts';
import HostProviders from '$lib/organization/tests/host-providers.svelte';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing';
import { formatLocaleDate } from '$lib/platform/locale';
import { BUILT_IN, EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/organization/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { layOutLists } from '#tests/permission.ts';
import { toErrorText } from '$lib/error/message';
import { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';

/**
 * A WORKSPACE'S PAGE
 *
 * Ticket 49 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1
 * as revised 2026-10-03, at the human's word: "manage members in the workspaces the form looks bad
 * the switch it needs to be a better looking maybe a page details like how records have pages
 * record and dicreocty of members and at the top information". A workspace's card opens its page
 * the way a complex's card opens its own: what the workspace is at the top, with the card's acts.
 *
 * **Who holds it** is ticket 50's, at the human's word of 2026-10-03: "the details page of a
 * workspace in the settings it should have a record search bar or feild that you search for a
 * member then add them to the worksace and a grid of cards sohwen to existing members and have
 * elipses as action for them regarding the workspace". A field finds a member by username and
 * puts them in at once; the holders are member cards, each with its menu: open member, tailor
 * access here, and remove from workspace, which asks first.
 *
 * **The refusals are the member's card's** (`accessRefusalOf`): putting somebody in a workspace
 * the reader holds read only is refused, and so is every grant and withdrawal, naming
 * `grantWorkspace`, for a reader without it. The owner and the reader are not cards here.
 *
 * The host's hooks are stood in for (`../../tests/host-hooks.ts`), so what the page writes is read
 * back as the hook it asked and what it handed over; the address and the navigation are mocked the
 * way the directory's test mocks them.
 */

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		dialog: { saveFile: vi.fn(), openFile: vi.fn() },
		opener: { revealItemInDir: vi.fn() },
		diagnostics: { write: vi.fn(async () => {}) }
	}
}));

vi.mock('$lib/api/caller', () => ({ default: {} }));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/member/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/member/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/role/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/role/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/access/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/access/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/workspace/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).syncHooks
}));

const { address, navigations } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings/workspaces/ws-1') },
	navigations: [] as string[]
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
		navigations.push(to);
		address.url = new URL(to, 'http://localhost');
		back.visit(address.url.pathname);
	}
}));

const workspaces: OrganizationWorkspace[] = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		databaseName: 'ws-1',
		databaseHostname: 'ws-1.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access',
		pinned: 0,
		granted: 0,
		permissions: maskOf(...EVERY_FLAG),
		createdAt: Date.UTC(2026, 2, 3, 12)
	},
	{
		id: 'ws-2',
		name: 'Jeddah',
		databaseName: 'ws-2',
		databaseHostname: 'ws-2.turso.io',
		schemaVersion: 1,
		accessLevel: 'read-only',
		pinned: 0,
		granted: 0,
		permissions: 0
	}
];

const member = (overrides: Partial<OrganizationMember>): OrganizationMember =>
	fakeOrganizationMember(overrides);

const everywhere = { access: 'full-access' as const, pinned: 0, granted: 0, permissions: 0 };

const members = [
	member({
		id: 'owner',
		username: 'olivia',
		role: 'owner',
		workspaces: [
			{ id: 'ws-1', ...everywhere },
			{ id: 'ws-2', ...everywhere }
		]
	}),
	member({
		id: 'ada',
		username: 'ada',
		role: 'manager',
		workspaces: [{ id: 'ws-1', ...everywhere }]
	}),
	member({ id: 'sami', username: 'sami', workspaces: [] })
];

/** the owner reading, holding every flag. */
const asOwner = () =>
	fakeOrganizationSession({
		memberId: 'owner',
		role: 'owner',
		permissions: maskOf(...EVERY_FLAG),
		workspaces
	});

const open = (workspaceId = 'ws-1', direction: 'ltr' | 'rtl' = 'ltr') => {
	address.url = new URL(`http://localhost/settings/workspaces/${workspaceId}`);

	return render(
		WorkspacePage,
		{ workspaceId },
		{ wrapper: HostProviders, wrapperProps: { strings, direction } }
	);
};

const heading = () => document.querySelector('h1')?.textContent?.trim();
const fact = (name: string) => document.querySelector<HTMLElement>(`[data-entry="${name}"]`);
const holderIds = () =>
	Array.from(document.querySelectorAll('[data-holder]')).map((card) =>
		card.getAttribute('data-holder')
	);
const holder = (id: string) => document.querySelector<HTMLElement>(`[data-holder="${id}"]`);
const dimmed = (element: HTMLElement | null) => element?.getAttribute('aria-disabled') === 'true';

/** the field that adds a member by search: its control, and what it lists once opened. */
const addControl = () => document.querySelector<HTMLElement>('[data-holder-add]');
const addRefusal = () =>
	document.querySelector('[data-holder-add-refusal]')?.textContent?.trim() ?? null;
const addSearch = () =>
	document.querySelector<HTMLInputElement>('[data-holder-candidates] input') ?? null;
const candidate = (id: string) =>
	document.querySelector<HTMLElement>(`[data-holder-candidate="${id}"]`);
const candidateIds = () =>
	Array.from(document.querySelectorAll('[data-holder-candidate]')).map((item) =>
		item.getAttribute('data-holder-candidate')
	);

/** a card's one control, and an entry on the menu it opened. */
const menuControl = (id: string) => holder(id)?.querySelector<HTMLButtonElement>('button') ?? null;
const entry = (act: string) =>
	document.querySelector<HTMLElement>(`[data-slot=dropdown-menu-item][data-act="${act}"]`);

/** open a card's control, read what its menu offers, and close it again. */
const actsOn = async (id: string) => {
	await fireEvent.click(menuControl(id)!);

	const offered = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).map(
		(item) => item.getAttribute('data-act')
	);

	await fireEvent.click(menuControl(id)!);

	return offered;
};

/** the reason a refused entry gives, read as a person reaches it: focused, in its tooltip. */
const reasonOf = async (refused: HTMLElement) => {
	await fireEvent.focus(refused);

	return await waitFor(() => {
		const drawn = document.querySelector('[data-unavailable-reason]');

		expect(drawn).not.toBeNull();

		return drawn?.textContent?.trim() ?? '';
	});
};
const acts = () =>
	Array.from(document.querySelectorAll('[data-page-act]')).map((act) =>
		act.getAttribute('data-page-act')
	);
const actControl = (id: string) =>
	document.querySelector<HTMLElement>(`[data-page-act="${id}"] button`);

beforeEach(() => {
	// the tiles are laid in as many columns as the directory's width holds, which it measures.
	layOutLists();
	resetOrganizationHost();
	resetHostAnswers();
	hostAnswers.session = asOwner();
	hostAnswers.members = members;
	hostAnswers.syncState = fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'ws-1' }) });
	loadLocale('en');
	setLocale('en');
	navigations.length = 0;
});

// criterion: an unknown id says so, with the way back to the workspaces.
test('a workspace nobody here holds says it is not there', () => {
	open('ws-gone');

	expect(document.querySelector('[data-empty="not-found"]')).not.toBeNull();
	expect(document.querySelector('[data-access-row]')).toBeNull();
});

// criterion: back returns to the workspaces section. The trail keys a screen by its path, so the
// settings area is `/settings` there whichever section the reader left; back takes the section
// this page is listed in rather than the area's first.
test('back returns to the workspaces section the page was opened from', async () => {
	back.visit('/settings');
	back.visit('/settings/workspaces/ws-1');
	open();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-back-control]')!);

	expect(navigations).toEqual(['/settings?section=workspaces']);
});

test('back from a page reached from somewhere else returns there', async () => {
	back.visit('/contracts');
	back.visit('/settings/workspaces/ws-1');
	open();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-back-control]')!);

	expect(navigations).toEqual(['/contracts']);
});

// criterion: the header shows the name, the open badge where open, access, made date and holder
// count, each with its glyph.
test('the header names the workspace, says it is open here, and states its facts with glyphs', () => {
	open('ws-1');

	expect(heading()).toBe('Riyadh');
	expect(document.querySelector('[data-workspace-open]')?.textContent?.trim()).toBe(
		en.organization.dashboard.workspaceOpenHere
	);

	expect(fact('members')?.textContent).toContain('2');
	expect(fact('members')?.querySelector('svg.lucide-users')).not.toBeNull();
	expect(fact('access')?.textContent).toContain(en.organization.dashboard.workspaceYouOwn);
	expect(fact('access')?.querySelector('svg.lucide-key-round')).not.toBeNull();
	expect(fact('created')?.textContent).toContain(
		formatLocaleDate('en', workspaces[0].createdAt!, { dateStyle: 'medium' })
	);
	expect(fact('created')?.querySelector('svg.lucide-calendar-plus')).not.toBeNull();
});

test('a workspace not open here carries no open badge, says nobody where nobody holds it, and no date where none is known', () => {
	hostAnswers.members = [member({ id: 'sami', username: 'sami' })];
	open('ws-2');

	expect(heading()).toBe('Jeddah');
	expect(document.querySelector('[data-workspace-open]')).toBeNull();
	expect(fact('members')?.textContent).toContain(en.organization.dashboard.workspaceCard.noMembers);
	expect(fact('created')).toBeNull();
});

// criterion: its acts are the card's, refused as there. Who holds it is this page, so it is not
// offered on it again.
test('the header carries the card acts but members, edit on the open one alone', () => {
	const first = open('ws-1');

	expect(acts()).toEqual([
		'workspace.edit',
		'workspace.export',
		'workspace.import',
		'workspace.delete'
	]);
	first.unmount();

	open('ws-2');

	expect(acts()).toEqual(['workspace.export', 'workspace.import', 'workspace.delete']);
	// Jeddah is held read only, so its import is refused, with the reason, as on its card.
	expect(dimmed(actControl('workspace.import'))).toBe(true);
	expect(dimmed(actControl('workspace.export'))).toBe(false);
});

test('a reader without the flags reads the acts refused, and delete is the owner alone', () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'ada',
		role: 'manager',
		permissions: 0,
		workspaces: [{ ...workspaces[0], permissions: 0 }]
	});
	open('ws-1');

	expect(acts()).toEqual(['workspace.export', 'workspace.import']);
	expect(dimmed(actControl('workspace.export'))).toBe(true);
	expect(dimmed(actControl('workspace.import'))).toBe(true);
});

test('an act on the page asks the host, which opens what it opens', async () => {
	open('ws-1');

	await fireEvent.click(actControl('workspace.delete')!);

	await waitFor(() => {
		expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
	});
});

// ----- who holds it: a grid of member cards (ticket 50)

// criterion: the holders render as a grid of member cards, the owner and the reader not.
test('the people who hold it are a grid of member cards at the tile height, the owner not', () => {
	open('ws-1');

	expect(holderIds()).toEqual(['ada']);
	expect(document.querySelector('[data-holders]')?.getAttribute('data-columns')).not.toBeNull();

	const ada = holder('ada')!;

	expect(ada.style.height).toBe(`${MEMBER_TILE_HEIGHT}px`);
	expect(ada.querySelector('[data-member-username]')?.textContent?.trim()).toBe('ada');
	expect(ada.querySelector('[data-member-role]')?.textContent?.trim()).toBe('manager');
	expect(ada.querySelector('[data-slot="avatar"]')).not.toBeNull();
	expect(ada.querySelectorAll('[data-field]').length).toBeGreaterThan(0);
	// no switch is left on the page: who holds it is changed by the search and the menus.
	expect(document.querySelector('[role="switch"]')).toBeNull();
	expect(document.querySelector('[data-access-row]')).toBeNull();
});

test('the reader is not a card: their own row is not theirs to write', () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'ada',
		role: 'manager',
		permissions: maskOf(...EVERY_FLAG),
		workspaces
	});
	open('ws-1');

	expect(holderIds()).toEqual([]);
});

test('a person tailored here is marked custom here on their card', () => {
	hostAnswers.members = [
		members[0],
		{
			...members[1],
			permissions: BUILT_IN.manager.mask,
			workspaces: [
				{
					id: 'ws-1',
					access: 'full-access',
					pinned: maskOf('deletePayment'),
					granted: 0,
					permissions: BUILT_IN.manager.mask - maskOf('deletePayment')
				}
			]
		},
		member({ id: 'kai', username: 'kai', workspaces: [{ id: 'ws-1', ...everywhere }] })
	];
	open('ws-1');

	expect(holder('ada')?.querySelector('[data-member-custom-here]')?.textContent?.trim()).toBe(
		en.organization.workspaceSwitches.customHere
	);
	expect(holder('kai')?.querySelector('[data-member-custom-here]')).toBeNull();
});

test('with nobody holding it the grid says so', () => {
	hostAnswers.members = [members[0], members[2]];
	open('ws-1');

	expect(holderIds()).toEqual([]);
	expect(document.querySelector('[data-holders-empty]')?.textContent).toContain(
		en.organization.workspacePage.nobodyHolds
	);
});

// ----- adding by search (ticket 50)

// criterion: the field lists only who can hold it and is not in it, filters by username, and
// choosing one grants through the access mutation.
test('the add field offers only members not in it, filtered by username', async () => {
	hostAnswers.members = [
		...members,
		member({ id: 'samira', username: 'samira', workspaces: [] }),
		member({ id: 'noura', username: 'noura', workspaces: [] })
	];
	open('ws-1');

	expect(addControl()?.textContent).toContain(en.organization.workspacePage.addPlaceholder);

	await fireEvent.click(addControl()!);

	await waitFor(() => expect(candidateIds()).toEqual(['sami', 'samira', 'noura']));

	await fireEvent.input(addSearch()!, { target: { value: 'sam' } });

	await waitFor(() => expect(candidateIds()).toEqual(['sami', 'samira']));
});

test('choosing a member puts them in at full access, at once', async () => {
	open('ws-1');

	await fireEvent.click(addControl()!);
	await waitFor(() => expect(candidate('sami')).not.toBeNull());
	await fireEvent.click(candidate('sami')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-1', memberId: 'sami', access: 'full-access' }] }
			}
		]);
	});
	expect(document.querySelector('form')).toBeNull();
});

test('a grant the shell refuses says its reason at the field', async () => {
	const refusal = new Error('refused');

	hostAnswers.refusals.useChangeAccess = refusal;
	open('ws-1');

	await fireEvent.click(addControl()!);
	await waitFor(() => expect(candidate('sami')).not.toBeNull());
	await fireEvent.click(candidate('sami')!);

	await waitFor(() => {
		expect(document.querySelector('[data-holder-add-error]')?.textContent?.trim()).toBe(
			toErrorText(refusal, i18nObject('en'))
		);
	});
});

test('with everybody in it the field says there is nobody left to add', async () => {
	hostAnswers.members = [members[0], members[1]];
	open('ws-1');

	expect(dimmed(addControl())).toBe(true);
	expect(addControl()?.textContent).toContain(en.organization.workspacePage.nobodyToAdd);

	await fireEvent.click(addControl()!);
	expect(document.querySelector('[data-holder-candidates]')).toBeNull();
});

// a granter gives only what they reach: where the reader holds it read only, nobody is put in.
test('a workspace the reader holds read only offers no usable field, and says why', async () => {
	hostAnswers.members = [
		members[0],
		member({ id: 'ada', username: 'ada', workspaces: [{ id: 'ws-2', ...everywhere }] }),
		members[2]
	];
	open('ws-2');

	expect(dimmed(addControl())).toBe(true);
	expect(addRefusal()).toBe(en.organization.workspaceSwitches.notHeld);

	await fireEvent.click(addControl()!);
	expect(document.querySelector('[data-holder-candidates]')).toBeNull();
	expect(hostAnswers.writes).toEqual([]);
});

test('a reader without grantWorkspace meets no usable field, naming it', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0,
		workspaces
	});
	hostAnswers.members = [members[0], members[1], member({ id: 'sami', username: 'sami' })];
	open('ws-1');

	expect(dimmed(addControl())).toBe(true);
	expect(addRefusal()).toBe(lacking(i18nObject('en'), 'grantWorkspace'));

	await fireEvent.click(addControl()!);
	expect(document.querySelector('[data-holder-candidates]')).toBeNull();
});

// ----- each card's menu (ticket 50)

// criterion: each card's menu holds open member, tailor access here and remove from workspace,
// the remove red.
test('a card offers open member, tailor access here, and remove from workspace in red', async () => {
	open('ws-1');

	expect(await actsOn('ada')).toEqual(['holder.open', 'holder.tailor', 'holder.remove']);

	await fireEvent.click(menuControl('ada')!);
	expect(entry('holder.remove')?.getAttribute('data-variant')).toBe('destructive');
	// a menu entry reads in title case in english, as every menu's does.
	const words = (act: string) => entry(act)?.textContent?.trim().toLowerCase();

	expect(words('holder.remove')).toBe(en.organization.workspacePage.removeFromWorkspace);
	expect(words('holder.tailor')).toBe(en.organization.workspacePage.tailorHere);
	expect(words('holder.open')).toBe(en.organization.workspacePage.openMember);
});

test('remove from workspace asks first, and withdraws only once answered', async () => {
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);
	await fireEvent.click(entry('holder.remove')!);

	const asked = await waitFor(() => {
		const dialog = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');

		expect(dialog).not.toBeNull();

		return dialog!;
	});

	expect(asked.textContent).toContain('ada');
	expect(hostAnswers.writes).toEqual([]);

	const confirm = Array.from(asked.querySelectorAll('button')).find((button) =>
		button.textContent?.includes(en.organization.workspacePage.removeFromWorkspace)
	);

	await fireEvent.click(confirm!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-1', memberId: 'ada', access: 'none' }] }
			}
		]);
	});
});

test('tailor access here opens the member sheet with this workspace permissions open', async () => {
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);
	await fireEvent.click(entry('holder.tailor')!);

	await waitFor(() => {
		expect(document.querySelector('[data-member-sheet]')).not.toBeNull();
		expect(document.querySelector('[data-tailor-open="access-ws-1-tailor"]')).not.toBeNull();
	});
});

test('open member goes to their card in the members section', async () => {
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);
	await fireEvent.click(entry('holder.open')!);

	await waitFor(() => {
		expect(navigations.at(-1)).toBe('/settings?section=organization&member=ada');
	});
});

test('a reader without the flags reads remove and tailor refused, each with its reason', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0,
		workspaces
	});
	hostAnswers.members = [members[0], members[1], member({ id: 'sami', username: 'sami' })];
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);

	expect(dimmed(entry('holder.remove'))).toBe(true);
	expect(await reasonOf(entry('holder.remove')!)).toBe(lacking(i18nObject('en'), 'grantWorkspace'));
	expect(dimmed(entry('holder.tailor'))).toBe(true);
	expect(dimmed(entry('holder.open'))).toBe(false);

	await fireEvent.click(entry('holder.remove')!);
	expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
	expect(hostAnswers.writes).toEqual([]);
});

test('tailoring somebody ranked at or above the reader is refused, saying so', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'kai',
		role: 'manager',
		rank: BUILT_IN.manager.rank,
		permissions: maskOf(...EVERY_FLAG),
		workspaces
	});
	hostAnswers.members = [
		members[0],
		{ ...members[1], rank: BUILT_IN.manager.rank },
		member({ id: 'kai', username: 'kai', role: 'manager' })
	];
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);

	expect(dimmed(entry('holder.tailor'))).toBe(true);
	expect(await reasonOf(entry('holder.tailor')!)).toBe(en.organization.dashboard.notBelowYou);
	expect(dimmed(entry('holder.remove'))).toBe(false);
});

test('and in arabic the page reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	hostAnswers.members = [
		members[0],
		member({ id: 'ada', username: 'ada', workspaces: [{ id: 'ws-2', ...everywhere }] }),
		members[2]
	];
	open('ws-2', 'rtl');

	expect(addRefusal()).toBe(ar.organization.workspaceSwitches.notHeld);
	expect(ar.organization.workspacePage.addPlaceholder).not.toBe(
		en.organization.workspacePage.addPlaceholder
	);
	expect(holderIds()).toEqual(['ada']);
	expect(fact('access')?.textContent).toContain(ar.organization.dashboard.workspaceYouOwn);

	setLocale('en');
});

test('and in arabic an empty workspace and a full one say so in its words', () => {
	loadLocale('ar');
	setLocale('ar');
	hostAnswers.members = [members[0]];
	open('ws-1', 'rtl');

	expect(document.querySelector('[data-holders-empty]')?.textContent).toContain(
		ar.organization.workspacePage.nobodyHolds
	);
	expect(addControl()?.textContent).toContain(ar.organization.workspacePage.nobodyToAdd);

	setLocale('en');
});
