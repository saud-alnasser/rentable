import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Members from '$lib/organization/member/component/directory.svelte';
import { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';
import { columnsFor, RECORD_TILE_MIN_WIDTH } from '$lib/list';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import { organizationHostState, resetOrganizationHost } from '$lib/organization/host.svelte';
import {
	fakeOrganizationMember,
	fakeOrganizationRoles,
	fakeOrganizationSession
} from '$lib/organization/tests/testing';
import type {
	MemberStanding,
	OrganizationMember,
	OrganizationWorkspace
} from '$lib/organization/host';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { expectCreateControlLast } from '$lib/create/tests/control';
import { BAR_CONTROL, expectBarOrder } from '$lib/design/tests/set-bar';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import {
	insideTheWait,
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from '$lib/list/tests/search';
import { BUILT_IN, WRITE_FLAGS, maskOf, type Flag } from '@rentable/workspace-permission';

import { layOutLists } from '#tests/permission.ts';
import { expectTheEye } from '#tests/password-eye.ts';

import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import HostProviders from '$lib/organization/tests/host-providers.svelte';
import { unfold } from '$lib/organization/tests/switches';
import {
	areaOf,
	expectBoundedArea,
	expectFadeWhileMoreBelow,
	expectFocusScrollsTile,
	expectNoPhysicalSides
} from '$lib/organization/tests/directory-grid';

/**
 * THE MEMBERS, AS A DIRECTORY OF CARDS
 *
 * Criterion 19 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]: one
 * record card per account, each with its standing, the acts on the card's own menu by the gates
 * effort 826's requirement 15 set, the owner's card carrying a manager nothing, and the add
 * at the foot. *It was a list of rows until the human saw them in the running build.*
 *
 * **What a card carries** is the username, the role, one line of standing and the workspaces held
 * as chips with their access. The standing is two facts read as a sentence, and it gates nothing:
 * a card says where the account stands and offers the link either way.
 *
 * **What a card offers** is drawn from the reader's permissions alone, and an act the session
 * lacks is absent from the menu rather than disabled in it. Every act is read by opening the
 * card's one control: a card whose menu is open is the only one in the document, so the items in
 * it are that card's, in the order the acts are built; `actsOn` opens a card, reads them, and
 * closes it again, and a card that offers this reader nothing has no control to open.
 *
 * **Activating a card opens its record** ([[rules/interface]], *Row activation*), and for an
 * account with no page of its own that means this section's address with the account named on it.
 * Both halves are read here: the `href` a card carries, and what the section does when the address
 * carries one.
 *
 * **The address and the navigation are mocked**, the way `app/tests/settings-area.svelte.test.ts`
 * mocks the address: `$app/state` carries no navigation under this runner, and `goto` has no
 * router to reach.
 *
 * Requirement 21 of effort 824 holds throughout: a card names its member by the one username and
 * carries no address and no display name. Requirement 24's avatar is the same two letters the rail
 * draws.
 *
 * **What a card's act opens is the organization host's** (effort 832, requirement 8), mounted once
 * in the frame, so the section is rendered with the host beside it (`./host-providers.svelte`) and
 * the host's hooks stood in for (`./host-hooks.ts`). A write a card asks for is read off what the
 * host asked of those hooks. Each entry is read by the act it projects, `data-act`, which is what
 * `act/act.ts` marks an entry with. The username's own rule is read on the sheet, in
 * `sheet.svelte.test.ts`.
 */

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

vi.mock('$lib/organization/session/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/session/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

const { address, navigations } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings?section=organization') },
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
	// partial, because the host's workspace rename form's `superForm` reaches `beforeNavigate` from the same
	// module: what is stood in for is the one navigation this section makes.
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async (to: string) => {
		navigations.push(to);
		address.url = new URL(to, 'http://localhost');
	}
}));

/** the reader is standing at the organization section, with or without an account named on it. */
const at = (search = '?section=organization') => {
	address.url = new URL(`http://localhost/settings${search}`);
};

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
		permissions: 0
	},
	{
		id: 'ws-2',
		name: 'Jeddah',
		databaseName: 'ws-2',
		databaseHostname: 'ws-2.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access',
		pinned: 0,
		granted: 0,
		permissions: 0
	}
];

const member = (overrides: Partial<OrganizationMember>): OrganizationMember =>
	fakeOrganizationMember(overrides);

const members = [
	member({ id: 'owner', username: 'olivia', role: 'owner' }),
	member({
		id: 'ada',
		username: 'ada',
		role: 'manager',
		workspaces: [
			{ id: 'ws-1', access: 'full-access', pinned: 0, granted: 0, permissions: 0 },
			{ id: 'ws-2', access: 'read-only', pinned: 0, granted: 0, permissions: 0 }
		]
	}),
	member({
		id: 'sami',
		username: 'sami',
		workspaces: [{ id: 'ws-1', access: 'full-access', pinned: 0, granted: 0, permissions: 0 }]
	})
];

const standing = (overrides: Partial<MemberStanding> & { memberId: string }): MemberStanding => ({
	passwordSet: true,
	machineSignedIn: false,
	locked: false,
	...overrides
});

/** olivia and ada are in and working; sami was made and has not opened a link yet. */
const standings: MemberStanding[] = [
	standing({ memberId: 'owner', machineSignedIn: true }),
	standing({ memberId: 'ada' }),
	standing({ memberId: 'sami', passwordSet: false })
];

const list = (
	overrides: Partial<Parameters<typeof render<typeof Members>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Members,
		{
			members,
			standings,
			canInvite: true,
			canRemove: true,
			canLockOut: true,
			canRename: true,
			canReset: true,
			canAssignRole: true,
			canOverride: true,
			canGrantWorkspace: true,
			isOwner: true,
			selfId: 'owner',
			rank: BUILT_IN.owner.rank,
			permissions: BUILT_IN.owner.mask,
			...overrides
		},
		{ wrapper: HostProviders, wrapperProps: { strings, direction } }
	);

/** the acts a card can offer, in the order they are declared, by the name this file reads them by. */
const KINDS = {
	'member.withdrawOffer': 'withdraw-offer',
	'member.offerOwnership': 'transfer',
	'member.edit': 'edit',
	'member.makeLink': 'link',
	'member.unsetPassword': 'unset-password',
	'member.endSessions': 'end-sessions',
	'member.remove': 'remove',
	'member.lockOut': 'lock-out'
} as const;

const kindOf = (item: Element) =>
	KINDS[item.getAttribute('data-act') as keyof typeof KINDS] ?? item.textContent;

const actOf = (kind: string) =>
	Object.entries(KINDS).find(([, named]) => named === kind)?.[0] ?? kind;

/**
 * an act's entry on the menu that is open. One card's menu is open at a time, so the entry is that
 * card's: the card is the one the caller opened, which the entry itself does not repeat.
 */
const on = (kind: string) =>
	document.querySelector<HTMLElement>(`[data-slot=dropdown-menu-item][data-act="${actOf(kind)}"]`);
const card = (id: string) => document.querySelector(`[data-member="${id}"]`);

/** the one control a card carries, or nothing where this reader may do nothing to that account. */
const control = (id: string) => card(id)?.querySelector<HTMLButtonElement>('button') ?? null;

/** open a card's control, read what its menu offers, and close it again. */
const actsOn = async (id: string) => {
	const trigger = control(id);

	if (!trigger) return [];

	await fireEvent.click(trigger);

	const offered = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).map(
		kindOf
	);

	await fireEvent.click(trigger);

	return offered;
};

/** open a card's control and hand back one act's entry, the way a person reaches it. */
const openTo = async (id: string, kind: string) => {
	await fireEvent.click(control(id)!);

	return on(kind);
};

/** open a card's control and press one act. */
const press = async (id: string, kind: string) => {
	await fireEvent.click((await openTo(id, kind))!);
};
const surface = () => document.querySelector('[data-slot=form-surface]');
const usernameInput = () => document.querySelector<HTMLInputElement>('input[name=username]');

/**
 * the reason an unavailable entry gives, read the way a person reaches it: the entry takes the
 * focus and its tooltip says why. The tooltip is placed against its trigger, and jsdom implements
 * no `ResizeObserver`, so the shared one that observes nothing stands in.
 */
const reasonOf = async (entry: HTMLElement) => {
	layOutLists();

	await fireEvent.focus(entry);

	return await waitFor(() => {
		const drawn = document.querySelector('[data-slot=tooltip-content]');

		expect(drawn).not.toBeNull();

		return drawn?.textContent ?? '';
	});
};

/** the removal the host is asking about, read fresh each time. */
const removing = () => organizationHostState.member.removing;

/** what the host asked of one hook, in the order it asked. */
const written = (hook: string) =>
	hostAnswers.writes.filter((write) => write.hook === hook).map((write) => write.input);

beforeEach(() => {
	// the tiles are laid in as many columns as the directory's width holds, which it measures.
	layOutLists();
	resetOrganizationDialogs();
	resetOrganizationHost();
	resetHostAnswers();
	hostAnswers.session = fakeOrganizationSession({ memberId: 'owner', workspaces });
	loadLocale('en');
	setLocale('en');
	navigations.length = 0;
	at();
});

// criterion 19: one record card per account, and the person who has not opened a link yet is one
// of them.
test('one card is drawn per account, in the order the list answers them', () => {
	list();

	expect(document.querySelectorAll('[data-members]')).toHaveLength(1);
	expect(document.querySelectorAll('[data-member]')).toHaveLength(3);
	expect(
		Array.from(document.querySelectorAll('[data-member-username]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['olivia', 'ada', 'sami']);
	// no second list, and no heading for one.
	expect(document.querySelector('[data-pending-accounts]')).toBeNull();
});

// criterion 19: a card carries the username, the role, how many workspaces are held, and one line
// of standing.
test('a card carries the avatar, the username and the role', () => {
	list();

	const ada = card('ada')!;

	expect(ada.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim()).toBe('AD');
	expect(ada.querySelector('[data-member-username]')?.textContent?.trim()).toBe('ada');
	expect(ada.textContent).toContain(en.layout.signIn.roleManager);
	// one name on the card, and nothing that would carry a second one.
	expect(ada.querySelectorAll('[data-member-username]')).toHaveLength(1);
	expect(ada.textContent).not.toContain('@');
});

// the human's second look: a chip per workspace, each carrying its own access, read as a second
// list along the bottom of every card. What a card says now is how many, as one fact; which ones
// and what each is good for is what the menu's workspaces entry opens.
test('a card says how many workspaces are held, as one fact, and names none of them', () => {
	list();

	const held = (id: string) => {
		const line = card(id)!.querySelector('[data-member-workspaces]')!;

		return [line.getAttribute('data-member-workspaces'), line.textContent?.trim()];
	};

	// many, one, and none: the figure under the field's name (effort 846, ticket 37), numbered by
	// the locale layer, and none said in words rather than as a zero.
	const translations = i18nObject('en');

	expect(held('ada')).toEqual(['2', '2']);
	expect(held('sami')).toEqual(['1', '1']);
	expect(held('owner')).toEqual(['0', en.organization.dashboard.memberCard.noWorkspaces]);
	expect(translations.organization.dashboard.memberCard.workspaceCount({ count: 2 })).toBe('2');
	expect(translations.organization.dashboard.memberCard.workspaceCount({ count: 1000 })).toBe(
		'1,000'
	);

	// and no workspace is named on a card any more, nor what it is good for.
	expect(document.querySelector('[data-member-workspace]')).toBeNull();
	expect(document.body.textContent).not.toContain('Riyadh');
	expect(document.body.textContent).not.toContain('read only');
});

// criterion 19 of effort 828, as ticket 32 of effort 846 draws it: where an account stands is two
// facts on the tile, its password and its machine, read from the members query joined to the
// register on the member's id.
test('each card says where its account stands, its password and its machine', () => {
	const open = list();

	const standingOf = (id: string) => [
		card(id)!.querySelector('[data-member-password]')?.getAttribute('data-member-password'),
		card(id)!.querySelector('[data-member-machine]')?.getAttribute('data-member-machine')
	];

	expect(standingOf('sami')).toEqual(['unset', 'none']);
	expect(standingOf('ada')).toEqual(['set', 'none']);
	expect(standingOf('owner')).toEqual(['set', 'signed-in']);
	expect(card('sami')!.querySelector('[data-member-password]')?.textContent?.trim()).toBe(
		en.organization.dashboard.memberCard.noPassword
	);
	expect(card('owner')!.querySelector('[data-member-machine]')?.textContent?.trim()).toBe(
		en.organization.dashboard.memberCard.signedIn
	);
	open.unmount();

	// the standings are a second read, so the cards are drawn before they arrive, and a line
	// guessed from nothing would say something untrue about an account somebody is working on.
	list({ standings: [] });

	expect(document.querySelectorAll('[data-member-password]')).toHaveLength(0);
	expect(document.querySelectorAll('[data-member-machine]')).toHaveLength(0);
	expect(document.querySelectorAll('[data-member]')).toHaveLength(3);
});

// effort 846, ticket 32: the members are tiles in a grid, as many across as the directory's width
// holds at the list shell's tile width and never more than three, each at the height its component
// declares.
test('the members stand in a grid of tiles, at the declared height', () => {
	list();

	const grid = document.querySelector<HTMLElement>('[data-members]')!;

	expect(grid.classList).toContain('grid');
	// jsdom lays nothing out, so the width is nothing and the grid is the one column it falls to.
	expect(grid.dataset.columns).toBe('1');

	for (const id of ['owner', 'ada', 'sami']) {
		const holder = card(id) as HTMLElement;

		expect(holder.style.height).toBe(`${MEMBER_TILE_HEIGHT}px`);
		expect(holder.querySelector('[data-layout=tile]')).not.toBeNull();
	}
});

test('at a width of a thousand pixels the members are laid three across', async () => {
	const measured = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);

	try {
		list();

		const grid = document.querySelector<HTMLElement>('[data-members]')!;

		await waitFor(() => expect(grid.dataset.columns).toBe('3'));
		expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
		// the shell's own rule, at its own tile width.
		expect(columnsFor(1000, RECORD_TILE_MIN_WIDTH, 12)).toBe(3);
	} finally {
		measured.mockRestore();
	}
});

/** a directory of this many members past the three the file is written over. */
const crowd = (count: number) => [
	...members,
	...Array.from({ length: count - members.length }, (_, index) =>
		member({ id: `extra-${index}`, username: `extra${index}` })
	)
];

/** the directory measured at this width, for the test inside. */
const atWidth = async (width: number, run: () => Promise<void> | void) => {
	const measured = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);

	try {
		await run();
	} finally {
		measured.mockRestore();
	}
};

// effort 846, ticket 53, at the human's walks of 2026-10-03: past a few rows the cards scroll
// inside the directory's own area, the tray staying put above, and the rows in view follow the
// columns: "for mobile size 2 cards ... for mid screen 2 columns become 4 cards meaning 2x2; for
// full screen 3x3 cards 9 cards".
test('at three across, nine members are in view and the rest scroll in their own area, under the tray', async () => {
	await atWidth(1000, async () => {
		list({ members: crowd(12) });

		const grid = document.querySelector<HTMLElement>('[data-members]')!;

		await waitFor(() => expect(grid.dataset.columns).toBe('3'));
		expect(grid.querySelectorAll('[data-member]')).toHaveLength(12);
		expectBoundedArea(grid, {
			tileHeight: MEMBER_TILE_HEIGHT,
			columns: 3,
			legendId: 'members-legend'
		});
		await expectFadeWhileMoreBelow(areaOf(grid)!);
	});
});

test('at two across, four members are in view, two rows', async () => {
	await atWidth(700, async () => {
		list({ members: crowd(7) });

		const grid = document.querySelector<HTMLElement>('[data-members]')!;

		await waitFor(() => expect(grid.dataset.columns).toBe('2'));
		expectBoundedArea(grid, {
			tileHeight: MEMBER_TILE_HEIGHT,
			columns: 2,
			legendId: 'members-legend'
		});
	});
});

test('at one across, two members are in view', async () => {
	// jsdom lays nothing out, so the width is nothing and the grid is the one column it falls to.
	list({ members: crowd(6) });

	const grid = document.querySelector<HTMLElement>('[data-members]')!;

	expectBoundedArea(grid, {
		tileHeight: MEMBER_TILE_HEIGHT,
		columns: 1,
		legendId: 'members-legend'
	});
});

test('with fewer members than the rows hold the area is bounded and no taller than its cards', async () => {
	await atWidth(1000, async () => {
		list();

		const grid = document.querySelector<HTMLElement>('[data-members]')!;

		await waitFor(() => expect(grid.dataset.columns).toBe('3'));
		expect(grid.querySelectorAll('[data-member]')).toHaveLength(3);
		expectBoundedArea(grid, {
			tileHeight: MEMBER_TILE_HEIGHT,
			columns: 3,
			legendId: 'members-legend'
		});
		expect(areaOf(grid)!.hasAttribute('data-more-below')).toBe(false);
	});
});

test('the keyboard reaching a card below the fold brings it into view, in either direction', async () => {
	list({ members: crowd(7) });

	await expectFocusScrollsTile(card('extra-3') as HTMLElement);
	expectNoPhysicalSides(areaOf(document.querySelector('[data-members]')!)!);
	cleanup();

	loadLocale('ar');
	setLocale('ar');
	list({ members: crowd(7) }, 'rtl');

	expectNoPhysicalSides(areaOf(document.querySelector('[data-members]')!)!);
	await expectFocusScrollsTile(card('extra-3') as HTMLElement);
	setLocale('en');
});

// requirement 19: the section says what it is for in the tray above the cards, and the tray is
// what the contracts view has.
test('the section says who is listed and what it is for, in the tray', () => {
	list();

	const tray = document.querySelector('[data-directory-tray]')!;

	expect(tray.querySelector('[data-directory-description]')?.textContent?.trim()).toBe(
		en.organization.dashboard.membersDescription
	);
	expect(tray.querySelector('legend')?.textContent?.trim()).toBe(
		en.organization.dashboard.membersTitle
	);
	// above the cards, not around them.
	const first = document.querySelector('[data-member]')!;

	expect(tray.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(tray.contains(first)).toBe(false);
});

// [[rules/interface]], *Row activation*: activating a card opens its record, which for an account
// is this section's address with the account named on it.
test('a card opens its own record, and nothing on the card itself does anything else', async () => {
	list();

	const ada = card('ada')!;
	const opens = ada.querySelector('a')!;

	expect(opens.getAttribute('href')).toBe('/settings?section=organization&member=ada');
	expect(opens.getAttribute('aria-label')).toBe('ada');
	// the acts are behind the card's one control, and nothing else on it is pressable.
	expect(ada.querySelectorAll('button')).toHaveLength(1);
	expect(ada.querySelectorAll('a')).toHaveLength(1);
	// and nothing left that a reader has to hover to find: the one control answers a press with no
	// pointer having been over the card, which is what *reachable without hovering* means to
	// somebody reading the section. *This read the card's markup for `opacity-0`, which passes on
	// any other way of hiding a control and fails on any other use of the class.*
	expect(document.querySelector('[data-member-actions]')).toBeNull();

	const trigger = ada.querySelector<HTMLButtonElement>('button')!;

	expect(trigger.hidden).toBe(false);
	expect(trigger.getAttribute('aria-hidden')).toBeNull();
	await fireEvent.click(trigger);
	expect(document.querySelectorAll('[data-slot=dropdown-menu-item]').length).toBeGreaterThan(0);
});

// the other half of the same rule: the section reads the account off the address and opens that
// account's edit, then clears it, so pressing the same card twice opens the same surface twice.
test('the address naming an account opens that account and is cleared', async () => {
	at('?section=organization&member=ada');
	list();

	await waitFor(() => {
		expect(document.querySelector('[data-member-sheet]')).not.toBeNull();
	});
	expect(
		screen.getByText(
			en.organization.dashboard.memberSheetDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
	expect(navigations).toEqual(['/settings?section=organization']);
});

test('an address naming nobody opens nothing and navigates nowhere', () => {
	list();

	expect(surface()).toBeNull();
	expect(navigations).toEqual([]);
});

// criterion 19: each act sits behind its own flag. The owner reading holds every flag, so every act
// is on every card but their own.
test('the owner sees every act on every card but their own', async () => {
	list();

	expect(await actsOn('ada')).toEqual([
		'edit',
		'link',
		'unset-password',
		'end-sessions',
		'remove',
		'lock-out'
	]);
	expect(await actsOn('sami')).toEqual([
		'edit',
		'link',
		'unset-password',
		'end-sessions',
		'remove',
		'lock-out'
	]);
});

// requirement 19: the owner's account is removed by nobody and edited by nobody but the owner, so
// a manager meets a card with no menu at all and no gesture behind it.
test('the owner card carries a manager nothing, and is drawn with no menu', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'ada' });

	expect(control('owner')).toBeNull();
	expect(await actsOn('owner')).toEqual([]);
	// a card with nothing to offer claims neither route, so there is no control to name either.
	expect(card('owner')?.querySelector('.sr-only')).toBeNull();
	// the reader's own card is still nobody's to write: its edit is there, refused as their own.
	expect(await actsOn('ada')).toEqual(['edit']);
});

// and the same card read by the owner: one act and no other, because nobody edits their own role,
// permissions or workspaces (requirement 19) and handing the organization over is the owner's own
// (requirement 22). The rest of the card is as empty as it was.
test('the owner card offers the owner the transfer alone', async () => {
	list();

	expect(await actsOn('owner')).toEqual(['transfer']);
	expect(on('transfer')).toBeNull();
});

// criterion 22: the act is on the owner's own card and on nobody else's.
test('the transfer is on the owner own card and on no other', async () => {
	list();

	expect(await actsOn('ada')).not.toContain('transfer');
	expect(await actsOn('sami')).not.toContain('transfer');
});

// requirement 22: a handover is two acts on two machines, so between them there is a standing
// offer, and the owner's card is where it is seen and taken back. The offer and the withdrawal are
// never on the card together, because there is one offer at a time and Rust refuses a second.
/**
 * the question a member act that ends something asks (effort 846, requirement 2 as revised on
 * 2026-10-02): nothing is written while it stands, and it is answered with the act's own verb.
 */
async function answer(verb: string) {
	const question = () => document.querySelector<HTMLElement>('[data-confirm-dialog]');

	await waitFor(() => expect(question()).not.toBeNull());

	const confirm = [...question()!.querySelectorAll<HTMLButtonElement>('button')].find(
		(button) => button.textContent?.trim() === verb
	);

	expect(confirm).toBeDefined();
	await fireEvent.click(confirm!);
	await waitFor(() => expect(question()).toBeNull());
}

test('the owner card offers the withdrawal in the offer place while an offer stands', async () => {
	list({
		members: [
			member({ id: 'owner', username: 'olivia', role: 'owner' }),
			member({ id: 'ada', username: 'ada', role: 'manager', offeredOwnership: true }),
			member({ id: 'sami', username: 'sami' })
		]
	});

	expect(await actsOn('owner')).toEqual(['withdraw-offer']);

	await press('owner', 'withdraw-offer');

	// it ends the offer, so it asks first, and writes once answered (effort 846, requirement 2 as
	// revised on 2026-10-02); no other surface opens.
	expect(surface()).toBeNull();
	expect(written('useWithdrawOffer')).toEqual([]);
	await answer(en.organization.dashboard.withdrawOffer);
	await waitFor(() => {
		expect(written('useWithdrawOffer')).toHaveLength(1);
	});
});

// and it is the owner's: a manager reading the owner's card still meets no menu at all,
// which is the card requirement 19 leaves empty for everybody but its holder.
test('a manager meets no transfer on the owner card', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'ada' });

	expect(control('owner')).toBeNull();
	expect(await actsOn('owner')).toEqual([]);
});

// requirement 22: what the surface says is the whole of what changes, in plain words, and the
// two halves nobody would guess are that this is an offer the other person accepts on a machine
// of their own, and that the Turso account stays put. It takes the account and the password and
// nothing else.
test('the offer opens a heavy form surface naming what changes and taking the password', async () => {
	list();

	expect(surface()).toBeNull();

	await press('owner', 'transfer');

	const form = document.querySelector('[data-transfer-ownership-form]');

	expect(form).not.toBeNull();

	// the heavy weight, read off the surface that was rendered. A heavy form is the edge panel the
	// full height of the window and a light one is the centred card; what tells them apart in the
	// document is what each presents as, which is why the rendered element is what is read here.
	// *It read the surface off disk and regexed the attribute until ticket 20, which passes on a
	// component nothing renders.*
	const panel = surface()!;

	expect(panel).not.toBeNull();
	expect(panel.className).toContain('h-full');
	expect(panel.className).not.toContain('rounded-3xl');
	expect(document.querySelector('[data-transfer-ownership-goes]')?.textContent?.trim()).toBe(
		en.organization.dashboard.transferOwnershipGoes
	);
	expect(document.querySelector('[data-transfer-ownership-authority]')?.textContent?.trim()).toBe(
		en.organization.dashboard.transferOwnershipAuthority
	);
	expect(form?.querySelector('input[type=password]')).not.toBeNull();
	// effort 851, criterion 19: the password carries the eye.
	await expectTheEye(
		document.querySelector<HTMLInputElement>('#transfer-ownership-password'),
		strings.showPassword
	);
});

// the account the organization goes to is chosen on the surface, and the owner's own row is not
// one of the choices: they are the owner already, and Rust refuses that by name. The chooser is
// the same `Select` the role and access surfaces use, whose list is drawn in a portal on opening,
// so what is read here is how many accounts were handed to it rather than the opened list.
test('every account whose password is set is offered on the handover', async () => {
	list();

	await press('owner', 'transfer');

	// ada alone: olivia is the owner, and sami has not opened a link yet, so sami has no vault of
	// their own for the organization's next key to come out of.
	expect(
		document
			.querySelector('[data-transfer-ownership-accounts]')
			?.getAttribute('data-transfer-ownership-accounts')
	).toBe('1');
});

// and a lone owner has nobody to hand it to, so the act is shown refused with that reason rather
// than missing, and pressing it opens no surface with an empty chooser (effort 846, requirement 14).
test('an owner who is the only account meets the handover refused, saying why', async () => {
	list({
		members: [member({ id: 'owner', username: 'olivia', role: 'owner' })],
		standings: [standing({ memberId: 'owner', machineSignedIn: true })]
	});

	expect(await actsOn('owner')).toEqual(['transfer']);

	const transfer = await openTo('owner', 'transfer');

	expect(transfer?.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(transfer!)).toContain(en.organization.dashboard.nobodyOfferable);
	await fireEvent.click(transfer!);
	expect(organizationHostState.member.offering).toBeNull();
	expect(surface()).toBeNull();
});

// [[rules/interface]], *Validation errors*: the shell refuses a password that does not open the
// owner's vault, so that is the field the sentence belongs to and the surface stays open.
test('a refused offer marks the password and the surface stays open', async () => {
	hostAnswers.refusals.useOfferOwnership = new Error('that value did not open');
	list();

	await press('owner', 'transfer');
	await openSelect(document.querySelector<HTMLElement>('#transfer-ownership-account')!);
	await chooseOption(
		Array.from(document.querySelectorAll<HTMLElement>('[data-slot=select-item]')).find(
			(item) => item.textContent?.trim() === 'ada'
		)!
	);

	const password = document.querySelector<HTMLInputElement>(
		'[data-transfer-ownership-form] input[type=password]'
	)!;

	await fireEvent.input(password, { target: { value: 'not the one' } });
	await fireEvent.submit(password.closest('form')!);

	await waitFor(() => {
		expect(password.getAttribute('aria-invalid')).toBe('true');
	});
	expect(written('useOfferOwnership')).toEqual([{ memberId: 'ada', password: 'not the one' }]);
	expect(screen.getByText('that value did not open')).toBeDefined();
	expect(surface()).not.toBeNull();
});

// effort 838, requirement 12: nobody changes their own role or override, and the card says so at
// the control rather than leaving it out. A manager reading their own card meets the edit refused
// with that reason, and nothing else; everybody else's card below them is still theirs to write.
test('the edit on a reader own card is refused, saying it is their own', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'ada', rank: BUILT_IN.manager.rank });

	expect(await actsOn('ada')).toEqual(['edit']);

	const edit = await openTo('ada', 'edit');

	expect(edit?.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(edit!)).toContain(en.organization.dashboard.yourOwn);
	await fireEvent.click(edit!);
	expect(organizationHostState.member.editing).toBeNull();
	await fireEvent.click(control('ada')!);

	expect(await actsOn('sami')).toContain('edit');
});

// and requirement 7: a member at the reader's own rank is written by somebody above them. Every
// act on their card is drawn refused with that reason.
test('a card at the reader rank is refused, saying they are not below the reader', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'zoe', rank: BUILT_IN.manager.rank });

	expect(await actsOn('ada')).toEqual(['edit', 'link', 'unset-password', 'end-sessions', 'remove']);

	const edit = await openTo('ada', 'edit');

	expect(edit?.getAttribute('aria-disabled')).toBe('true');
	expect(on('remove')?.getAttribute('aria-disabled')).toBe('true');
	expect(await reasonOf(edit!)).toContain(en.organization.dashboard.notBelowYou);
	await fireEvent.click(control('ada')!);

	// sami holds the member role, below a manager, and is theirs.
	await openTo('sami', 'edit');
	expect(on('edit')?.getAttribute('aria-disabled')).not.toBe('true');
});

test('a member holding no act sees no card action at all, and no add control', () => {
	list({
		canInvite: false,
		canRemove: false,
		canLockOut: false,
		canRename: false,
		canReset: false,
		canAssignRole: false,
		canOverride: false,
		canGrantWorkspace: false,
		isOwner: false,
		selfId: 'sami'
	});

	for (const id of ['owner', 'ada', 'sami']) {
		expect(control(id), id).toBeNull();
	}
	expect(document.querySelector('[data-invite-open]')).toBeNull();
});

// each act on its own, so no entry is being carried by a neighbour's gate.
test('each act is drawn by its own act and by no other', async () => {
	const only = async (
		overrides: Partial<Parameters<typeof render<typeof Members>>[1]>,
		id: string,
		offered: string[]
	) => {
		const rendered = list({
			canInvite: false,
			canRemove: false,
			canLockOut: false,
			canRename: false,
			canReset: false,
			canAssignRole: false,
			canOverride: false,
			canGrantWorkspace: false,
			isOwner: false,
			selfId: 'owner',
			...overrides
		});

		expect(await actsOn(id), offered.join()).toEqual(offered);
		rendered.unmount();
	};

	// one entry, and either act draws it: the sheet holds whichever section that act writes.
	await only({ canAssignRole: true }, 'ada', ['edit']);
	await only({ canOverride: true }, 'ada', ['edit']);
	await only({ canGrantWorkspace: true }, 'ada', ['edit']);
	await only({ canAssignRole: true, canGrantWorkspace: true }, 'ada', ['edit']);
	// the name is part of the one edit (effort 832, requirement 6), so renaming draws it too.
	await only({ canRename: true }, 'ada', ['edit']);
	// unsetting a password and closing the ways in that are already open are one act read twice,
	// and the link follows `resetPassword` as well as `inviteMember`, the way Rust and the router
	// admit it: a reset is a fresh way in, and whoever hands one out hands out the link that
	// carries it (effort 828, requirement 20, the human's word at review round one).
	await only({ canReset: true }, 'ada', ['link', 'unset-password', 'end-sessions']);
	await only({ canRemove: true }, 'ada', ['remove']);
	// the lock-out needs the Turso authority as well as the act, so it takes both.
	await only({ canRemove: true, canLockOut: true }, 'ada', ['remove', 'lock-out']);
	await only({ canInvite: true }, 'ada', ['link']);
	await only({ canInvite: true, canReset: true }, 'ada', [
		'link',
		'unset-password',
		'end-sessions'
	]);
	// and no act reaches the owner's card, whichever act the reader holds: the owner's own card
	// offers the one act that is theirs, and nothing a permission gates. The reader's own card
	// carries the edit and nothing else, refused as their own (effort 838, requirement 12).
	await only({ canGrantWorkspace: true, isOwner: true, selfId: 'owner' }, 'owner', ['transfer']);
	await only({ canGrantWorkspace: true, selfId: 'ada' }, 'ada', ['edit']);
	await only({ canAssignRole: true, selfId: 'ada' }, 'ada', ['edit']);
	await only({ canRemove: true, canReset: true, selfId: 'ada' }, 'ada', []);
});

// effort 828, requirement 20 as the human corrected it on 2026-09-20: the link act is on every card
// this reader may write, whatever the standing line says. An account is held on as many machines as
// it is given links for, so the line is a fact about the account and never the reason a link is
// missing. *This test asserted the opposite, and the card the line barred was the one the human met
// in the closed build.*
test('the link act is offered whatever the standing says, and the line stays a fact', async () => {
	const open = list();

	// sami has no password yet and ada has one with nobody signed in: both are offered a link.
	expect(await actsOn('sami')).toContain('link');
	expect(await actsOn('ada')).toContain('link');

	const entry = await openTo('sami', 'link');

	expect(entry?.textContent?.trim()).toBe(toTitleCase(en.organization.dashboard.makeLink));
	expect(document.querySelector('[data-member-copy-link]')).toBeNull();
	expect(document.querySelector('[data-member-code]')).toBeNull();
	open.unmount();

	const signedIn = list({
		selfId: 'owner',
		standings: [
			standing({ memberId: 'owner', machineSignedIn: true }),
			standing({ memberId: 'ada', machineSignedIn: true }),
			standing({ memberId: 'sami', passwordSet: false, machineSignedIn: true })
		]
	});

	// a card standing *signed in on a machine* says so and offers the link all the same.
	expect(card('ada')?.querySelector('[data-member-machine]')?.textContent?.trim()).toBe(
		en.organization.dashboard.memberCard.signedIn
	);
	expect(await actsOn('ada')).toContain('link');
	expect(await actsOn('sami')).toContain('link');
	signedIn.unmount();

	// and a card drawn before the standings arrive offers it too: the standings are a second read,
	// and the act no longer waits on one. The line is what waits, and its absence says nothing
	// about the act. *It waited here until 2026-09-20, because an act drawn from nothing would
	// have been refused by Rust on the gate this stood in for.*
	const loading = list({ standings: [] });

	expect(card('ada')?.querySelector('[data-member-password]')).toBeNull();
	expect(card('ada')?.querySelector('[data-member-machine]')).toBeNull();
	expect(await actsOn('ada')).toContain('link');
	expect(await actsOn('sami')).toContain('link');
	expect(await actsOn('ada')).toContain('edit');
	loading.unmount();
});

// criterion 22 of effort 826: ending somebody's sessions is `resetPassword`'s, beside the reset and
// never on the owner's card or the reader's own. The press reaches the route, which is where the
// mutation is.
test('signing a member out of every machine is offered behind reset password, and never on the owner', async () => {
	list({ selfId: 'ada', isOwner: false });

	expect(await actsOn('owner')).not.toContain('end-sessions');
	expect(await actsOn('ada')).not.toContain('end-sessions');
	expect(await actsOn('sami')).toContain('end-sessions');

	const entry = await openTo('sami', 'end-sessions');

	expect(entry?.textContent?.trim()).toBe(toTitleCase(en.organization.dashboard.endSessions));

	await fireEvent.click(entry!);

	// it signs them out, so it asks first, and writes once answered.
	expect(written('useEndMemberSessions')).toEqual([]);
	await answer(en.organization.dashboard.endSessions);
	await waitFor(() => {
		expect(written('useEndMemberSessions')).toEqual([{ memberId: 'sami' }]);
	});
});

test('a card hands its own account to the link, the reset and the removals', async () => {
	list();

	// the link asks how long it lasts first, at three days until changed (effort 851, requirement
	// 11), and is made once that is answered.
	await press('sami', 'link');
	expect(written('useMakeMemberLink')).toEqual([]);
	expect(document.querySelector('[data-link-lifetime]')?.getAttribute('data-link-lifetime')).toBe(
		'72'
	);
	await fireEvent.click(screen.getByRole('button', { name: en.organization.dashboard.makeLink }));
	await waitFor(() => {
		expect(written('useMakeMemberLink')).toEqual([{ memberId: 'sami', lifetimeHours: 72 }]);
	});
	// the link is shown once, on the one panel the shell holds for it.
	await waitFor(() => {
		expect(organizationDialog.madeLink?.code).toBe('ABC234');
	});

	// the reset takes their password away, so it asks first, and writes once answered.
	await press('sami', 'unset-password');
	expect(written('useUnsetMemberPassword')).toEqual([]);
	await answer(en.organization.dashboard.unsetPassword);
	await waitFor(() => {
		expect(written('useUnsetMemberPassword')).toEqual([{ memberId: 'sami' }]);
	});

	// the removals ask first, at the speed the entry named, and write nothing until answered.
	await press('sami', 'remove');
	expect(removing()?.record.member.id).toBe('sami');
	expect(removing()?.lockOut).toBe(false);
	organizationHostState.member.removing = null;

	await press('sami', 'lock-out');
	expect(removing()?.record.member.id).toBe('sami');
	expect(removing()?.lockOut).toBe(true);
	expect(written('useRemoveMember')).toEqual([]);
});

// the human's first look: the menu's words are one or two apiece, and the sentence that explains
// an act belongs to the surface it opens. *Two entries read as headings, `role and permissions`
// and `workspaces and access`, and a third as a sentence, `reset the password`.*
test('every act on the menu reads as one or two plain words', async () => {
	list();

	await fireEvent.click(control('ada')!);

	const said: Record<string, string> = Object.fromEntries(
		[...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map((item) => [
			kindOf(item) ?? '?',
			item.textContent?.trim() ?? ''
		])
	);

	// one verb per act (effort 832, requirement 6): the edit, and no rename beside it.
	expect(said).toEqual({
		edit: toTitleCase(en.common.actions.edit),
		link: toTitleCase(en.organization.dashboard.makeLink),
		'unset-password': toTitleCase(en.organization.dashboard.unsetPassword),
		'end-sessions': toTitleCase(en.organization.dashboard.endSessions),
		remove: toTitleCase(en.organization.dashboard.remove),
		'lock-out': toTitleCase(en.organization.dashboard.lockOut)
	});

	for (const [kind, words] of Object.entries(said)) {
		expect(words.split(' ').length, `${kind}: ${words}`).toBeLessThanOrEqual(3);
	}

	// and the surface says what it is about, which the entry has no room for.
	expect(en.organization.dashboard.memberSheetDescription).toContain('{username:string}');
});

// requirement 19: the two acts that destroy something are marked as such on the menu.
test('the two acts that destroy something are marked', async () => {
	list();

	await fireEvent.click(control('sami')!);

	expect(on('remove')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('lock-out')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('edit')?.getAttribute('data-variant')).toBe('default');
});

// requirement 19, corrected: an account is made from the tray above the cards rather than from
// the foot, on the surface the shell holds.
test('the add control stands in the tray before the first card and asks the shell for the form', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.organization.dashboard.addMember });
	const tray = document.querySelector('[data-directory-tray]')!;
	const first = document.querySelector('[data-member]')!;

	// the contracts view's control: quiet, glyph-only, and named on the control itself.
	expect(tray.contains(opener)).toBe(true);
	expect(opener.querySelector('svg')).not.toBeNull();
	expect(opener.textContent?.trim()).toBe('');
	expect(opener.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	// the one create control, in the position every set gives it (effort 832, criterion 9(a)).
	expect(opener.hasAttribute('data-create-control')).toBe(true);
	expectCreateControlLast();
	expect(organizationDialog.open).toBeNull();
	await fireEvent.click(opener);
	expect(organizationDialog.open).toBe('account');
	// no account surface of its own: the one instance is mounted in the shell.
	expect(surface()).toBeNull();
});

// criterion 23: one entry opens one sheet of three sections, on the member it named, and the two
// entries that opened two dialogs are gone from the menu.
test('the edit act opens the sheet on the member it named, with its three sections', async () => {
	list();

	await press('sami', 'edit');

	expect(surface()).not.toBeNull();
	expect(
		screen.getByText(
			en.organization.dashboard.memberSheetDescription.replace('{username:string}', 'sami')
		)
	).toBeDefined();
	expect(
		Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
			block.getAttribute('data-sheet-section')
		)
	).toEqual(['name', 'role', 'override', 'workspaces']);
	// the workspaces the member holds, as rows of the sheet rather than a second surface.
	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ws-1', 'ws-2']);
	expect(document.querySelector('[data-role-form]')).toBeNull();
	expect(document.querySelector('[data-access-form]')).toBeNull();
});

// criterion 23: one save runs the acts that exist, each with what was chosen on it.
test('one save writes the override and the grants through the acts that exist', async () => {
	list();

	await press('sami', 'edit');

	// sami holds ws-1 and nothing else, and nothing is changed for them. Renaming members is
	// switched on for them alone, and the role is left where it is.
	// the organization's switches are folded until opened.
	await unfold('administration');
	await fireEvent.click(document.querySelector<HTMLElement>('#member-override-renameMember')!);
	// ws-2 switched on, which is a full-access grant.
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-2')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useSetOverride')).toEqual([
			{ memberId: 'sami', override: maskOf('renameMember') }
		]);
	});
	await waitFor(() => {
		expect(written('useChangeAccess')).toEqual([
			{ changes: [{ workspaceId: 'ws-2', memberId: 'sami', access: 'full-access' }] }
		]);
	});
	// the name and the role were left as they were, so neither was written.
	expect(written('useRenameMember')).toEqual([]);
	expect(written('useAssignRole')).toEqual([]);
	// nothing was refused, so the sheet closed on what it wrote.
	await waitFor(() => {
		expect(surface()).toBeNull();
	});
});

/** opens a workspace's permissions on the open sheet, and every group inside them. */
const openWorkspace = async (id: string) => {
	await fireEvent.click(
		document.querySelector<HTMLElement>(`[data-tailor="access-${id}-tailor"] [data-tailor-fold]`)!
	);
	await unfold(undefined, document.querySelector(`[data-tailor-open="access-${id}-tailor"]`)!);
};

// ticket 54 of effort 838, requirement 12 as amended a third time: what is tailored beneath a
// workspace is written after the grants, since a workspace override is set only on a workspace
// the member is in, one write per workspace whose pins changed, carrying both masks.
test('what is tailored in a workspace is written after the grants, one write per workspace', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	list();

	await press('sami', 'edit');

	// ws-1: every add, edit and delete turned off there; ws-2: put in, and deleting payments given
	// there.
	await openWorkspace('ws-1');

	const turnedOff: Flag[] = [];

	for (const flag of WRITE_FLAGS) {
		const control = document.querySelector<HTMLElement>(`#access-ws-1-tailor-${flag}`)!;

		if (control.getAttribute('aria-checked') === 'true') {
			turnedOff.push(flag);
			await fireEvent.click(control);
		}
	}

	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-2')!);
	await openWorkspace('ws-2');
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-2-tailor-deletePayment')!);
	await fireEvent.submit(document.querySelector('form')!);

	const readOnly = maskOf(...turnedOff);
	const deleting = maskOf('deletePayment');

	await waitFor(() => {
		expect(
			hostAnswers.writes
				.filter(({ hook }) => hook === 'useChangeAccess' || hook === 'useSetWorkspaceOverride')
				.map(({ hook, input }) => ({ hook, input }))
		).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-2', memberId: 'sami', access: 'full-access' }] }
			},
			{
				hook: 'useSetWorkspaceOverride',
				input: { memberId: 'sami', workspaceId: 'ws-1', pinned: readOnly, granted: 0 }
			},
			{
				hook: 'useSetWorkspaceOverride',
				input: { memberId: 'sami', workspaceId: 'ws-2', pinned: deleting, granted: deleting }
			}
		]);
	});
	expect(written('useSetOverride')).toEqual([]);
	await waitFor(() => {
		expect(surface()).toBeNull();
	});
});

// review round one of ticket 54: another role clears what is set for the member in every
// workspace, in the same act. Where a later write on the same save is refused and the sheet stays
// open, it is drawn from what went through, so no workspace reads as set any more.
test('a role that went through clears what the open sheet shows set in every workspace', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	hostAnswers.members = members.map((each) =>
		each.id === 'sami'
			? {
					...each,
					workspaces: [
						{
							id: 'ws-1',
							access: 'full-access' as const,
							pinned: maskOf('editPayment'),
							granted: 0,
							permissions: BUILT_IN.member.mask - maskOf('editPayment')
						}
					]
				}
			: each
	);
	hostAnswers.refusals.useChangeAccess = new Error('that workspace is not yours to grant');
	list({ members: hostAnswers.members });

	await press('sami', 'edit');

	const custom = () =>
		document.querySelector('[data-tailor="access-ws-1-tailor"] [data-tailor-custom]');

	expect(custom()).not.toBeNull();

	await openSelect(document.querySelector<HTMLElement>('#member-role')!);
	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-role="supervisor"]')!
	);
	// ws-2 switched on, which the shell refuses.
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-2')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-sheet-error="workspaces"]')).not.toBeNull();
	});
	expect(written('useAssignRole')).toHaveLength(1);
	expect(surface()).not.toBeNull();
	// the role went through, and with it what was set in ws-1.
	expect(custom()).toBeNull();

	// and saving again writes nothing for ws-1, which holds nothing now.
	delete hostAnswers.refusals.useChangeAccess;
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(surface()).toBeNull();
	});
	expect(written('useSetWorkspaceOverride')).toEqual([]);
	expect(written('useAssignRole')).toHaveLength(1);
});

// review round two of ticket 55: a grant minted read-only that a write turned on lifts to full
// access is written after what is pinned there, and not at all where that pin is refused, so a
// refusal never leaves the member with every write their role carries in that workspace.
test('a read-only grant is lifted only after what is pinned in it went through', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	hostAnswers.members = members.map((each) =>
		each.id === 'sami'
			? {
					...each,
					workspaces: [
						{
							id: 'ws-1',
							access: 'read-only' as const,
							pinned: 0,
							granted: 0,
							permissions: BUILT_IN.member.mask
						}
					]
				}
			: each
	);
	hostAnswers.refusals.useSetWorkspaceOverride = new Error('refused');
	list({ members: hostAnswers.members });

	await press('sami', 'edit');
	await openWorkspace('ws-1');
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-1-tailor-createUnit')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-sheet-error="workspaces"]')).not.toBeNull();
	});
	expect(written('useSetWorkspaceOverride')).toHaveLength(1);
	expect(written('useChangeAccess')).toEqual([]);

	// and once the pin goes through, the grant follows it.
	delete hostAnswers.refusals.useSetWorkspaceOverride;
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(surface()).toBeNull();
	});
	expect(
		hostAnswers.writes
			.filter(({ hook }) => hook === 'useChangeAccess' || hook === 'useSetWorkspaceOverride')
			.map(({ hook }) => hook)
	).toEqual(['useSetWorkspaceOverride', 'useSetWorkspaceOverride', 'useChangeAccess']);
});

// the hunt after ticket 59: a grant change that went through on a save whose other write was
// refused is what the open sheet is measured from, so taking the workspace out is not undone by the
// redraw and saving again sends nothing for it.
test('a workspace taken out on a partly refused save reads as out on the sheet left open', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	hostAnswers.refusals.useSetOverride = new Error('refused');
	list();

	await press('sami', 'edit');
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-1')!);
	await unfold('administration');
	await fireEvent.click(document.querySelector<HTMLElement>('#member-override-renameMember')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-sheet-error="override"]')).not.toBeNull();
	});
	expect(written('useChangeAccess')).toHaveLength(1);
	expect(document.querySelector('#access-ws-1')?.getAttribute('aria-checked')).toBe('false');

	delete hostAnswers.refusals.useSetOverride;
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(surface()).toBeNull();
	});
	expect(written('useChangeAccess')).toHaveLength(1);
});

// ticket 14 of effort 838: a role and an override changed on one save are one act, so the flags
// the reader must hold are the ones the two move together, and neither is written alone.
test('a changed role and a changed override are saved in one call', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	list();

	await press('sami', 'edit');

	await openSelect(document.querySelector<HTMLElement>('#member-role')!);
	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-role="supervisor"]')!
	);
	// the organization's switches are folded until opened.
	await unfold('administration');
	await fireEvent.click(document.querySelector<HTMLElement>('#member-override-renameMember')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useAssignRole')).toEqual([
			{ memberId: 'sami', roleId: 'supervisor', override: maskOf('renameMember') }
		]);
	});
	expect(written('useSetOverride')).toEqual([]);
	await waitFor(() => {
		expect(surface()).toBeNull();
	});
});

// ticket 45: the shell clears an override the assignment does not send, so a role changed with
// the very override the member had still sends it, and the member keeps what the card showed.
test('a changed role with the override the member had sends that override', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	hostAnswers.members = members.map((each) =>
		each.id === 'sami' ? { ...each, override: maskOf('renameMember') } : each
	);
	list({ members: hostAnswers.members });

	await press('sami', 'edit');

	await openSelect(document.querySelector<HTMLElement>('#member-role')!);
	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-role="supervisor"]')!
	);
	// the pick made them the supervisor exactly; renaming members is switched on again.
	await unfold('administration');
	await fireEvent.click(document.querySelector<HTMLElement>('#member-override-renameMember')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(written('useAssignRole')).toEqual([
			{ memberId: 'sami', roleId: 'supervisor', override: maskOf('renameMember') }
		]);
	});
	expect(written('useSetOverride')).toEqual([]);
});

// and the one act refused marks both the sections it was asked from, having written neither.
test('the one act refused marks the role and the override', async () => {
	hostAnswers.roles = fakeOrganizationRoles();
	hostAnswers.refusals.useAssignRole = new Error('you do not hold deletePayment');
	list();

	await press('sami', 'edit');

	await openSelect(document.querySelector<HTMLElement>('#member-role')!);
	await chooseOption(
		document.querySelector<HTMLElement>('[data-slot=select-item][data-role="supervisor"]')!
	);
	// the organization's switches are folded until opened.
	await unfold('administration');
	await fireEvent.click(document.querySelector<HTMLElement>('#member-override-renameMember')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-sheet-error="role"]')).not.toBeNull();
	});
	expect(document.querySelector('[data-sheet-error="override"]')).not.toBeNull();
	expect(written('useAssignRole')).toHaveLength(1);
	expect(written('useSetOverride')).toEqual([]);
	expect(surface()).not.toBeNull();
});

// [[rules/interface]], *Validation errors*: what an act refuses is said on the section that asked
// for it, and the sheet stays open on what was chosen.
test('a refused act marks its own section and leaves the sheet open', async () => {
	hostAnswers.refusals.useChangeAccess = new Error('that workspace is not yours to grant');
	list();

	await press('sami', 'edit');

	// ws-2 switched on, which is a full-access grant.
	await fireEvent.click(document.querySelector<HTMLElement>('#access-ws-2')!);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(
			document
				.querySelector('[data-sheet-section="workspaces"]')
				?.querySelector('[data-sheet-error="workspaces"]')
		).not.toBeNull();
	});
	expect(document.querySelector('[data-sheet-error="role"]')).toBeNull();
	expect(surface()).not.toBeNull();
});

// effort 832, requirement 6: the name is the one edit's first section, opened on the name the
// card holds, and a reader who may only rename meets that section alone.
test('the edit opens the name on the sheet, and a reader holding only renameMember writes that alone', async () => {
	const everything = list();

	await press('ada', 'edit');

	expect(usernameInput()?.value).toBe('ada');
	expect(screen.getByText(en.organization.dashboard.renameDescription)).toBeDefined();
	everything.unmount();
	resetOrganizationHost();

	list({
		canInvite: false,
		canRemove: false,
		canLockOut: false,
		canReset: false,
		canAssignRole: false,
		canOverride: false,
		canGrantWorkspace: false,
		isOwner: false,
		selfId: 'sami'
	});

	await press('ada', 'edit');

	// the role, what they may do and the workspaces are read by every reader of the card, and
	// refused to this one (the workspaces since ticket 48 of effort 838).
	expect(
		Array.from(document.querySelectorAll('[data-sheet-section]')).map((block) =>
			block.getAttribute('data-sheet-section')
		)
	).toEqual(['name', 'role', 'override', 'workspaces']);
	expect(document.querySelector('[data-switches-refusal]')).not.toBeNull();
	expect(document.querySelector('[data-access-refusal]')?.textContent?.trim()).toBe(
		en.organization.dashboard.lacksFlag.replace(
			'{flag:string}',
			en.organization.flags.grantWorkspace
		)
	);
});

test('a new name is written through the rename, and what Rust refuses marks the name', async () => {
	hostAnswers.refusals.useRenameMember = new Error('that username is taken');
	list();

	await press('ada', 'edit');
	await fireEvent.input(usernameInput()!, { target: { value: 'ada.l' } });
	await fireEvent.submit(usernameInput()!.closest('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-sheet-error="name"]')?.textContent?.trim()).toBe(
			'that username is taken'
		);
	});
	expect(written('useRenameMember')).toEqual([{ memberId: 'ada', username: 'ada.l' }]);
	expect(surface()).not.toBeNull();
});

test('and in arabic every card reads in its own words, right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(
		Array.from(document.querySelectorAll('[data-member-username]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['olivia', 'ada', 'sami']);
	expect(card('sami')?.querySelector('[data-member-password]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.memberCard.noPassword
	);
	// the count too, numbered by the Arabic locale rather than by a substitution this test
	// performs, under the field's own name in Arabic.
	expect(card('sami')?.querySelector('[data-member-workspaces]')?.textContent?.trim()).toBe(
		i18nObject('ar').organization.dashboard.memberCard.workspaceCount({ count: 1 })
	);
	expect(ar.organization.dashboard.memberCard.noWorkspaces).not.toBe(
		en.organization.dashboard.memberCard.noWorkspaces
	);
	expect(ar.organization.dashboard.memberCard.noPassword).not.toBe(
		en.organization.dashboard.memberCard.noPassword
	);
	expect(document.querySelector('[data-directory-description]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.membersDescription
	);
	expect(ar.organization.dashboard.membersDescription).not.toBe(
		en.organization.dashboard.membersDescription
	);
	expect(screen.getByRole('button', { name: ar.organization.dashboard.addMember })).toBeDefined();

	const lockOut = await openTo('ada', 'lock-out');

	expect(lockOut?.textContent?.trim()).toBe(ar.organization.dashboard.lockOut);
	expect(on('remove')?.textContent?.trim()).toBe(ar.organization.dashboard.remove);
	expect(on('edit')?.textContent?.trim()).toBe(ar.common.actions.edit);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.lockOut);

	setLocale('en');
});

// --- Search and order (effort 832, requirement 7) ------------------------------------------------

/** the members the directory is showing, by id, in the order it shows them. */
const shownMembers = () =>
	Array.from(document.querySelectorAll('[data-member]')).map((held) =>
		held.getAttribute('data-member')
	);

/** choose one of the orders the list shell's sort control offers. */
const orderBy = async (label: string) => {
	// named for the order it holds once one is chosen, so it is found by the words it starts with.
	await fireEvent.click(
		screen.getByRole('button', { name: new RegExp(`^${en.common.actions.sortBy}`) })
	);

	const item = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).find(
		(entry) => entry.textContent?.trim() === label
	);

	await fireEvent.click(item!);
};

// criterion 7(a): the directory searches with the list shell's field, so it leads with the glass.
test('the directory is searched from the list shell’s own bar, glass first', () => {
	list();

	const tray = document.querySelector('[data-directory-tray]')!;

	expect(searchGlass()).not.toBeNull();
	expect(tray.querySelector('[data-list-toolbar]')).not.toBeNull();
	expect(tray.contains(searchField())).toBe(true);
});

test('a term narrows the cards only once the reader stops typing', async () => {
	list();

	await typeSearch('ada');
	await insideTheWait();
	expect(shownMembers()).toEqual(['owner', 'ada', 'sami']);

	await pastTheWait();
	expect(shownMembers()).toEqual(['ada']);
	expect(document.querySelector('[data-list-count]')?.textContent?.trim()).toBe('1 result');
});

test('the search key puts the cursor in the directory’s field', async () => {
	list();

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});

test('a member is found by what their role is called', async () => {
	list();

	await typeSearch(en.layout.signIn.roleManager);
	await pastTheWait();

	expect(shownMembers()).toEqual(['ada']);
});

test('a search that finds nobody says so, in the list shell’s words', async () => {
	list();

	await typeSearch('nobody-here');
	await pastTheWait();

	expect(shownMembers()).toEqual([]);
	const noMatch = document.querySelector('[data-directory-no-match]');

	expect(noMatch?.querySelector('[data-empty]')?.getAttribute('data-empty')).toBe('no-match');
	expect(noMatch?.textContent).toContain(en.common.messages.noMatch);
	expect(noMatch?.textContent).toContain(en.common.actions.clearSearch);
});

test('the directory is ordered by username, then back the other way', async () => {
	list();

	await orderBy(en.organization.dashboard.username);
	expect(shownMembers()).toEqual(['ada', 'owner', 'sami']);

	await orderBy(en.organization.dashboard.username);
	expect(shownMembers()).toEqual(['sami', 'owner', 'ada']);
});

test('the directory is ordered by role, the most authority first', async () => {
	list({ members: [members[2], members[1], members[0]] });

	await orderBy(en.organization.dashboard.role);

	expect(shownMembers()).toEqual(['owner', 'ada', 'sami']);
});

// the settings directories offer nothing to export: a dozen accounts are not a file anybody wants.
test('the directory offers no transfer of its records', () => {
	list();

	expect(screen.queryByRole('button', { name: en.common.actions.transferData })).toBeNull();
});

// ticket 30 of effort 832: the tray orders its controls as the list shell's bar does, so what reads
// the set (the role table) stands before the order and the create is last; and the sentence under
// the legend is muted like every other description.
test('the tray orders search, count, what reads the set, sort and create as the list shell does', () => {
	list();

	expectBarOrder([BAR_CONTROL.search, BAR_CONTROL.count, BAR_CONTROL.sort, BAR_CONTROL.create]);
	expect(document.querySelector('[data-directory-description]')?.className).toContain(
		'text-muted-foreground'
	);
});
