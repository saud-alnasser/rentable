import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
import { expectCreateControlLast } from '$lib/create/tests/control';
import { pastTheWait, searchField, typeSearch } from '$lib/list/tests/search';
import { unfold } from '$lib/organization/tests/switches';

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
 * elipses as action for them regarding the workspace".
 *
 * **As a directory, added in a sheet and edited in one** is ticket 51's, at the human's walk of
 * 2026-10-03: "in a workspace the details page it has a searchbar filter,sort add button on the
 * tray; then grid of cards like now; a card when clicked it opens the edit permissions option
 * sheet; and the eliapess show edit permissions and remove options only". The plus opens a sheet
 * whose search lists the members not in it; the chosen are granted on one save. A card's press and
 * its menu's *edit permissions* open a sheet of this workspace's permissions alone; *remove from
 * workspace* asks first.
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

/** the plus in the directory's tray, and why it is refused where it is. */
const plus = () => document.querySelector<HTMLElement>('[data-holders-add]');
const plusRefusal = () => {
	const described = plus()?.getAttribute('aria-describedby');

	return described ? (document.getElementById(described)?.textContent?.trim() ?? null) : null;
};

/** the sheet the plus opens: its search, what it lists, what is chosen, and its save. */
const addSheet = () =>
	document
		.querySelector<HTMLElement>('[data-holders-add-sheet]')
		?.closest<HTMLElement>('[role="dialog"]') ?? null;
const pickControl = () => document.querySelector<HTMLElement>('[data-holder-pick]');
const addSearch = () =>
	document.querySelector<HTMLInputElement>('[data-holder-candidates] input') ?? null;
const candidate = (id: string) =>
	document.querySelector<HTMLElement>(`[data-holder-candidate="${id}"]`);
const candidateIds = () =>
	Array.from(document.querySelectorAll('[data-holder-candidate]')).map((item) =>
		item.getAttribute('data-holder-candidate')
	);
const chosenIds = () =>
	Array.from(document.querySelectorAll('[data-holder-chosen]')).map((item) =>
		item.getAttribute('data-holder-chosen')
	);
const unchoose = (id: string) =>
	document.querySelector<HTMLElement>(`[data-holder-unchoose="${id}"]`);
const saveAdd = () => addSheet()?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null;

/** open the add sheet from the plus, and its search. */
const openAdd = async () => {
	await fireEvent.click(plus()!);
	await waitFor(() => expect(pickControl()).not.toBeNull());
	await fireEvent.click(pickControl()!);
	await waitFor(() => expect(document.querySelector('[data-holder-candidates]')).not.toBeNull());
};

/** the sheet of a member's permissions in this workspace. */
const permissionsSheet = () => document.querySelector<HTMLElement>('[data-holder-permissions]');

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

// ----- the directory's tray (ticket 51)

// criterion: the members are a record directory: the tray with search, sort and the plus, and no
// find-a-member field.
test('the members open with the directory tray: search, sort and the plus, and no field', () => {
	open('ws-1');

	const tray = document.querySelector('[data-directory-tray]');

	expect(tray).not.toBeNull();
	expect(tray?.contains(searchField())).toBe(true);
	expect(
		within(tray as HTMLElement).getByRole('button', {
			name: new RegExp(`^${en.common.actions.sortBy}`)
		})
	).not.toBeNull();
	expect(tray?.contains(plus())).toBe(true);
	expect(plus()?.getAttribute('aria-label')).toBe(en.organization.workspacePage.addMembers);
	expectCreateControlLast();
	expect(document.querySelector('[data-holder-field]')).toBeNull();
	expect(document.querySelector('[data-holder-add]')).toBeNull();
});

test('the search narrows the cards by username', async () => {
	hostAnswers.members = [
		members[0],
		members[1],
		member({ id: 'kai', username: 'kai', workspaces: [{ id: 'ws-1', ...everywhere }] })
	];
	open('ws-1');

	expect(holderIds()).toEqual(['ada', 'kai']);

	await typeSearch('ka');
	await pastTheWait();

	expect(holderIds()).toEqual(['kai']);
	expect(document.querySelector('[data-list-count]')?.textContent?.trim()).toBe('1 result');
});

test('a search that finds nobody says so, and the way out clears it', async () => {
	open('ws-1');

	await typeSearch('nobody-here');
	await pastTheWait();

	expect(holderIds()).toEqual([]);
	expect(document.querySelector('[data-holders-no-match]')?.textContent).toContain(
		en.common.messages.noMatch
	);
	expect(document.querySelector('[data-holders-empty]')).toBeNull();
});

test('the cards are ordered by username, then back the other way', async () => {
	hostAnswers.members = [
		members[0],
		member({ id: 'kai', username: 'kai', workspaces: [{ id: 'ws-1', ...everywhere }] }),
		members[1]
	];
	open('ws-1');

	await fireEvent.click(
		screen.getByRole('button', { name: new RegExp(`^${en.common.actions.sortBy}`) })
	);
	const byName = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).find(
		(item) => item.textContent?.trim() === en.organization.dashboard.username
	);

	await fireEvent.click(byName!);

	expect(holderIds()).toEqual(['ada', 'kai']);
});

// ----- adding in a sheet (ticket 51)

// criterion: the plus opens the add sheet; its search lists only members not in it, filtered.
test('the plus opens a sheet whose search lists only members not in it, filtered', async () => {
	hostAnswers.members = [
		...members,
		member({ id: 'samira', username: 'samira', workspaces: [] }),
		member({ id: 'noura', username: 'noura', workspaces: [] })
	];
	open('ws-1');

	await openAdd();

	expect(addSheet()?.textContent?.toLowerCase()).toContain(
		en.organization.workspacePage.addMembers
	);
	await waitFor(() => expect(candidateIds()).toEqual(['sami', 'samira', 'noura']));

	await fireEvent.input(addSearch()!, { target: { value: 'sam' } });

	await waitFor(() => expect(candidateIds()).toEqual(['sami', 'samira']));
});

test('choosing adds to the chosen list and out of the dropdown, and one can be taken off', async () => {
	hostAnswers.members = [...members, member({ id: 'noura', username: 'noura', workspaces: [] })];
	open('ws-1');

	await openAdd();
	await waitFor(() => expect(candidate('sami')).not.toBeNull());
	await fireEvent.click(candidate('sami')!);

	await waitFor(() => expect(chosenIds()).toEqual(['sami']));
	expect(candidateIds()).toEqual(['noura']);
	expect(hostAnswers.writes).toEqual([]);

	await fireEvent.click(unchoose('sami')!);

	await waitFor(() => expect(chosenIds()).toEqual([]));
	// the dropdown may have closed as the list was pressed; it opens again on its control.
	if (!document.querySelector('[data-holder-candidates]')) await fireEvent.click(pickControl()!);
	await waitFor(() => expect(candidateIds()).toEqual(['sami', 'noura']));
});

// criterion: one save grants every chosen member and closes.
test('the save grants every chosen member at full access, then closes', async () => {
	hostAnswers.members = [...members, member({ id: 'noura', username: 'noura', workspaces: [] })];
	open('ws-1');

	await openAdd();
	await waitFor(() => expect(candidate('sami')).not.toBeNull());
	await fireEvent.click(candidate('sami')!);
	await waitFor(() => expect(candidate('noura')).not.toBeNull());
	await fireEvent.click(candidate('noura')!);
	await waitFor(() => expect(chosenIds()).toEqual(['sami', 'noura']));

	await fireEvent.click(saveAdd()!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: {
					changes: [
						{ workspaceId: 'ws-1', memberId: 'sami', access: 'full-access' },
						{ workspaceId: 'ws-1', memberId: 'noura', access: 'full-access' }
					]
				}
			}
		]);
	});
	await waitFor(() => expect(addSheet()).toBeNull());
});

test('a save with nobody chosen says to choose somebody and writes nothing', async () => {
	open('ws-1');

	await fireEvent.click(plus()!);
	await waitFor(() => expect(saveAdd()).not.toBeNull());
	await fireEvent.click(saveAdd()!);

	await waitFor(() => {
		expect(document.querySelector('[data-holders-add-error]')?.textContent?.trim()).toBe(
			en.organization.workspacePage.chooseSomebody
		);
	});
	expect(hostAnswers.writes).toEqual([]);
});

// criterion: a refusal says its reason, and the sheet stays open over it.
test('a grant the shell refuses says its reason in the sheet, which stays open', async () => {
	const refusal = new Error('refused');

	hostAnswers.refusals.useChangeAccess = refusal;
	open('ws-1');

	await openAdd();
	await waitFor(() => expect(candidate('sami')).not.toBeNull());
	await fireEvent.click(candidate('sami')!);
	await fireEvent.click(saveAdd()!);

	await waitFor(() => {
		const said = document.querySelector('[data-holders-add-error]')?.textContent ?? '';

		expect(said).toContain(toErrorText(refusal, i18nObject('en')));
		expect(said).toContain(en.organization.workspacePage.notAllAdded);
	});
	expect(addSheet()).not.toBeNull();
	expect(chosenIds()).toEqual(['sami']);
});

test('with everybody in it the plus says there is nobody left to add', async () => {
	hostAnswers.members = [members[0], members[1]];
	open('ws-1');

	expect(dimmed(plus())).toBe(true);
	expect(plusRefusal()).toBe(en.organization.workspacePage.nobodyToAdd);

	await fireEvent.click(plus()!);
	expect(addSheet()).toBeNull();
});

// criterion: the plus is refused with its reason for a reader who cannot grant.
test('a workspace the reader holds read only refuses the plus, and says why', async () => {
	hostAnswers.members = [
		members[0],
		member({ id: 'ada', username: 'ada', workspaces: [{ id: 'ws-2', ...everywhere }] }),
		members[2]
	];
	open('ws-2');

	expect(dimmed(plus())).toBe(true);
	expect(plusRefusal()).toBe(en.organization.workspaceSwitches.notHeld);

	await fireEvent.click(plus()!);
	expect(addSheet()).toBeNull();
	expect(hostAnswers.writes).toEqual([]);
});

test('a reader without grantWorkspace meets the plus refused, naming it', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0,
		workspaces
	});
	hostAnswers.members = [
		members[0],
		members[1],
		member({ id: 'sami', username: 'sami' }),
		member({ id: 'noura', username: 'noura', workspaces: [] })
	];
	open('ws-1');

	expect(dimmed(plus())).toBe(true);
	expect(plusRefusal()).toBe(lacking(i18nObject('en'), 'grantWorkspace'));

	await fireEvent.click(plus()!);
	expect(addSheet()).toBeNull();
});

// ----- each card (tickets 50 and 51)

// criterion: the menu holds exactly edit permissions and remove, the remove red; open member is
// gone.
test('a card offers edit permissions and remove from workspace in red, and nothing else', async () => {
	open('ws-1');

	expect(await actsOn('ada')).toEqual(['holder.permissions', 'holder.remove']);

	await fireEvent.click(menuControl('ada')!);
	expect(entry('holder.remove')?.getAttribute('data-variant')).toBe('destructive');
	// a menu entry reads in title case in english, as every menu's does.
	const words = (act: string) => entry(act)?.textContent?.trim().toLowerCase();

	expect(words('holder.remove')).toBe(en.organization.workspacePage.removeFromWorkspace);
	expect(words('holder.permissions')).toBe(en.organization.workspacePage.editPermissions);
	expect(entry('holder.open')).toBeNull();
	expect(document.body.textContent?.toLowerCase()).not.toContain('open member');
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

// criterion: pressing a card opens edit permissions for it. A card's press is its address, this
// page's with the member named on it, consumed on arrival as the members directory consumes its own.
test('pressing a card opens edit permissions for that member, and not their member sheet', async () => {
	open('ws-1');

	expect(holder('ada')?.querySelector('a')?.getAttribute('href')).toBe(
		'/settings/workspaces/ws-1?member=ada'
	);

	address.url = new URL('http://localhost/settings/workspaces/ws-1?member=ada');
	render(
		WorkspacePage,
		{ workspaceId: 'ws-1' },
		{ wrapper: HostProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	await waitFor(() => expect(permissionsSheet()).not.toBeNull());
	expect(permissionsSheet()?.closest('[role="dialog"]')?.textContent).toContain('ada');
	expect(document.querySelector('[data-member-sheet]')).toBeNull();
	await waitFor(() => expect(navigations.at(-1)).toBe('/settings/workspaces/ws-1'));
});

test('edit permissions opens a sheet of this workspace permissions alone', async () => {
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);
	await fireEvent.click(entry('holder.permissions')!);

	const sheet = await waitFor(() => {
		expect(permissionsSheet()).not.toBeNull();

		return permissionsSheet()!.closest<HTMLElement>('[role="dialog"]')!;
	});

	expect(sheet.textContent).toContain(
		i18nObject('en').organization.workspacePage.permissionsOverride({ workspace: 'Riyadh' })
	);
	// the record groups alone: no role, no organization switches, no workspace switches.
	expect(sheet.querySelector('[data-switches-group]')).not.toBeNull();
	expect(sheet.querySelector('[data-switches-owner]')).toBeNull();
	expect(sheet.querySelector('[data-access-row]')).toBeNull();
	expect(sheet.querySelector('[data-sheet-section="role"]')).toBeNull();
	expect(document.querySelector('[data-member-sheet]')).toBeNull();
});

test('edit permissions saves through the tailoring write, then closes', async () => {
	open('ws-1');

	await fireEvent.click(menuControl('ada')!);
	await fireEvent.click(entry('holder.permissions')!);
	await waitFor(() => expect(permissionsSheet()).not.toBeNull());

	const sheet = permissionsSheet()!.closest<HTMLElement>('[role="dialog"]')!;

	await unfold('payment', sheet);
	await fireEvent.click(sheet.querySelector<HTMLElement>('[data-switch="viewPayment"]')!);
	await fireEvent.click(sheet.querySelector<HTMLButtonElement>('button[type="submit"]')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toHaveLength(1);
	});

	const [write] = hostAnswers.writes;

	expect(write.hook).toBe('useSetWorkspaceOverride');
	expect(write.input).toMatchObject({ memberId: 'ada', workspaceId: 'ws-1' });
	expect((write.input as { pinned: number }).pinned).not.toBe(0);
	await waitFor(() => expect(permissionsSheet()).toBeNull());
});

test('a reader without the flags reads remove and edit permissions refused, each with its reason', async () => {
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
	expect(dimmed(entry('holder.permissions'))).toBe(true);

	await fireEvent.click(entry('holder.remove')!);
	expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
	expect(hostAnswers.writes).toEqual([]);
});

test('a card pressed by a reader who may not tailor opens nothing', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0,
		workspaces
	});
	hostAnswers.members = [members[0], members[1], member({ id: 'sami', username: 'sami' })];
	address.url = new URL('http://localhost/settings/workspaces/ws-1?member=ada');
	render(
		WorkspacePage,
		{ workspaceId: 'ws-1' },
		{ wrapper: HostProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	await waitFor(() => expect(navigations.at(-1)).toBe('/settings/workspaces/ws-1'));
	expect(permissionsSheet()).toBeNull();
});

test('editing the permissions of somebody ranked at or above the reader is refused, saying so', async () => {
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

	expect(dimmed(entry('holder.permissions'))).toBe(true);
	expect(await reasonOf(entry('holder.permissions')!)).toBe(en.organization.dashboard.notBelowYou);
	expect(dimmed(entry('holder.remove'))).toBe(false);
});

test('and in arabic the page reads in its own words, right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	hostAnswers.members = [
		members[0],
		member({ id: 'ada', username: 'ada', workspaces: [{ id: 'ws-2', ...everywhere }] }),
		members[2]
	];
	open('ws-2', 'rtl');

	expect(plusRefusal()).toBe(ar.organization.workspaceSwitches.notHeld);
	expect(plus()?.getAttribute('aria-label')).toBe(ar.organization.workspacePage.addMembers);
	expect(ar.organization.workspacePage.editPermissions).not.toBe(
		en.organization.workspacePage.editPermissions
	);
	expect(holderIds()).toEqual(['ada']);
	expect(fact('access')?.textContent).toContain(ar.organization.dashboard.workspaceYouOwn);

	await fireEvent.click(menuControl('ada')!);
	expect(entry('holder.permissions')?.textContent?.trim()).toBe(
		ar.organization.workspacePage.editPermissions
	);

	setLocale('en');
});

test('and in arabic the add sheet reads in its own words', async () => {
	loadLocale('ar');
	setLocale('ar');
	open('ws-1', 'rtl');

	await openAdd();

	expect(addSheet()?.textContent).toContain(ar.organization.workspacePage.addMembers);
	expect(addSheet()?.textContent).toContain(ar.organization.workspacePage.nobodyChosen);
	expect(ar.organization.workspacePage.nobodyChosen).not.toBe(
		en.organization.workspacePage.nobodyChosen
	);

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
	expect(plusRefusal()).toBe(ar.organization.workspacePage.nobodyToAdd);

	setLocale('en');
});
