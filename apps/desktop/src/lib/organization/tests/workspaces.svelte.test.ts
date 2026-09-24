import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Workspaces from '$lib/organization/component/workspaces.svelte';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import { organizationHostState, resetOrganizationHost } from '$lib/organization/host.svelte';
import { fakeOrganizationSession } from '$lib/platform/tests/testing';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import {
	insideTheWait,
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from '$lib/design/tests/search';
import { expectCreateControlLast } from '$lib/design/tests/create-control';
import { BAR_CONTROL, expectBarOrder } from '$lib/design/tests/set-bar';

import { hostAnswers, resetHostAnswers } from './host-hooks';
import HostProviders from './host-providers.svelte';

/**
 * THE WORKSPACES, AS A DIRECTORY OF CARDS
 *
 * Criterion 21 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]: one
 * record card per workspace, rename, members and delete on the card's own menu by the gates effort
 * 826's requirement 16 set, and the create control or the authority refusal in the tray above the
 * cards. *It was a row with a cluster of glyphs revealed on hover until this ticket, which is what
 * the human met in the running build.*
 *
 * **What a card carries** is the name and how many people hold the workspace, with a disc before
 * the name of the one open on this machine. The disc carries no visible text, so what is read here
 * is its accessible name, the way every other mark of this kind is read ([[rules/interface]],
 * *Status presentation*). *The card carried the open word as a badge and this reader's access as a
 * line of its own until the human's look at this directory.*
 *
 * **What a card offers** is drawn from the props alone, and an act the reader does not hold is
 * absent from the menu rather than disabled in it. Every act is read by opening the card's one
 * control: a card whose menu is open is the only one in the document, so the items in it are that
 * card's, in the order the acts are built; `actsOn` opens a card, reads them, and closes it again,
 * and a card that offers this reader nothing has no control to open.
 *
 * **The gates are props and none of them is read from a permission here**, which is what lets the
 * two owner-only acts be asserted at all: creating and deleting a workspace are the owner's in
 * Rust rather than a bit on anybody's row, so the section is handed who is reading, and the test
 * renders one reader and then another.
 *
 * **The rename is the open workspace's**, because `remoteSync.rename` calls this machine's
 * workspace something else and there is no command that renames one from a distance. So the entry
 * is behind `renameWorkspace` and behind the open mark, and both are read below.
 *
 * **Activating a card opens its record** ([[rules/interface]], *Row activation*), and for a
 * workspace with no page of its own that means this section's address with the workspace named on
 * it. Both halves are read here: the `href` a card carries, and what the section does when the
 * address carries one.
 *
 * **The address and the navigation are mocked**, the way `members.svelte.test.ts` mocks them:
 * `$app/state` carries no navigation under this runner, and `goto` has no router to reach.
 *
 * The rows the access dialog draws are the organization's members rather than its workspaces,
 * which is the same surface read the other way round; the owner is not among them, because Rust
 * refuses a withdrawal of the owner's own grant, and neither is the reader.
 *
 * **What a card's act opens is the organization host's** (effort 832, requirement 8), mounted once
 * in the frame, so the section is rendered with the host beside it (`./host-providers.svelte`) and
 * the host's hooks stood in for (`./host-hooks.ts`): the members the dialog lists and the session
 * that says who is reading are what those hooks answer. Each entry is read by the act it projects,
 * `data-act`. The name's entry reads *edit* (effort 832, requirement 6), where it read *rename*.
 */

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('./host-hooks')).hostHooks
}));

const { address, navigations } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings?section=workspaces') },
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
	// partial, because the rename form's `superForm` reaches `beforeNavigate` from the same
	// module: what is stood in for is the one navigation this section makes.
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async (to: string) => {
		navigations.push(to);
		address.url = new URL(to, 'http://localhost');
	}
}));

/** the reader is standing at the workspaces section, with or without a workspace named on it. */
const at = (search = '?section=workspaces') => {
	address.url = new URL(`http://localhost/settings${search}`);
};

const workspaces: OrganizationWorkspace[] = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		databaseName: 'ws-1',
		databaseHostname: 'ws-1.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access'
	},
	{
		id: 'ws-2',
		name: 'Jeddah',
		databaseName: 'ws-2',
		databaseHostname: 'ws-2.turso.io',
		schemaVersion: 1,
		accessLevel: 'read-only'
	}
];

const member = (overrides: Partial<OrganizationMember>): OrganizationMember => ({
	id: 'm',
	username: 'member',
	role: 'member',
	permissions: 0,
	workspaces: [],
	createdAt: 0,
	offeredOwnership: false,
	...overrides
});

const members = [
	member({
		id: 'owner',
		username: 'olivia',
		role: 'owner',
		workspaces: [
			{ id: 'ws-1', access: 'full-access' },
			{ id: 'ws-2', access: 'full-access' }
		]
	}),
	member({
		id: 'ada',
		username: 'ada',
		role: 'administrator',
		workspaces: [{ id: 'ws-1', access: 'full-access' }]
	}),
	member({ id: 'sami', username: 'sami', workspaces: [{ id: 'ws-1', access: 'read-only' }] })
];

const list = (
	overrides: Partial<Parameters<typeof render<typeof Workspaces>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Workspaces,
		{
			workspaces,
			members,
			openWorkspaceId: 'ws-1',
			canCreate: true,
			canDelete: true,
			canRename: true,
			canGrantWorkspace: true,
			refusal: null,
			...overrides
		},
		{ wrapper: HostProviders, wrapperProps: { strings, direction } }
	);

/** the acts a card can offer, in the order they are declared, by the name this file reads them by. */
const KINDS = {
	'workspace.edit': 'edit',
	'workspace.members': 'grant',
	'workspace.delete': 'delete'
} as const;

const kindOf = (item: Element) =>
	KINDS[item.getAttribute('data-act') as keyof typeof KINDS] ?? item.textContent;

const actOf = (kind: string) =>
	Object.entries(KINDS).find(([, named]) => named === kind)?.[0] ?? kind;

/**
 * an act's entry on the menu that is open, or a mark a card carries of its own (the open disc,
 * the count). One card's menu is open at a time, so an entry is that card's.
 */
const on = (kind: string, id: string) =>
	Object.values(KINDS).some((named) => named === kind)
		? document.querySelector(`[data-slot=dropdown-menu-item][data-act="${actOf(kind)}"]`)
		: document.querySelector(`[data-workspace-${kind}="${id}"]`);
const card = (id: string) => document.querySelector(`[data-workspace="${id}"]`);

/** the one control a card carries, or nothing where this reader may do nothing to it. */
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

/** open a card's control and press one act. */
const press = async (id: string, kind: string) => {
	await fireEvent.click(control(id)!);
	await fireEvent.click(on(kind, id)!);
};

const surface = () => document.querySelector('[data-slot=form-surface]');
const dialogTitle = () => document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim();
const dialogParagraphs = () =>
	Array.from(document.querySelectorAll('[data-slot="dialog-content"] p'));

/** the rail's own sentence for how many people are in a workspace, as the card draws it. */
const memberCount = (count: number) => i18nObject('en').layout.workspaceMenu.members({ count });

beforeEach(() => {
	resetOrganizationDialogs();
	resetOrganizationHost();
	resetHostAnswers();
	hostAnswers.session = fakeOrganizationSession({ memberId: 'owner', role: 'owner', workspaces });
	hostAnswers.members = members;
	loadLocale('en');
	setLocale('en');
	navigations.length = 0;
	at();
});

// criterion 21: one card per workspace, carrying the name, how many hold it, and the mark on the
// one open here.
test('one card is drawn per workspace, carrying its name and how many hold it', () => {
	list();

	expect(document.querySelectorAll('[data-workspaces]')).toHaveLength(1);
	expect(document.querySelectorAll('[data-workspace]')).toHaveLength(2);
	expect(
		Array.from(document.querySelectorAll('[data-workspace-name]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['Riyadh', 'Jeddah']);

	// three people hold Riyadh and one holds Jeddah, counted off the organization's own list.
	expect(on('members', 'ws-1')?.textContent?.trim()).toBe(memberCount(3));
	expect(on('members', 'ws-2')?.textContent?.trim()).toBe(memberCount(1));

	// the hostname is Turso's fact about a database, and not on the card.
	expect(card('ws-1')?.textContent).not.toContain('turso.io');
});

// the human's look at this directory: the shell says which workspace is open at the top of every
// screen, so the card marks it once and quietly, and what somebody holds is the surface the menu
// opens rather than a line on the card.
test('the open one is marked by a disc carrying its word, and no card says an access', () => {
	list();

	// the mark is on the one open here, and on no other card.
	expect(document.querySelectorAll('[data-workspace-open]')).toHaveLength(1);

	const mark = on('open', 'ws-1')!;

	// no visible text: a glyph, and the word read out and shown on hover.
	expect(mark.querySelector('svg')).not.toBeNull();
	expect(mark.textContent?.trim()).toBe(en.layout.workspaceMenu.open);
	expect(mark.querySelector('.sr-only')?.textContent?.trim()).toBe(en.layout.workspaceMenu.open);

	// and it stands before the name it marks.
	const name = card('ws-1')!.querySelector('[data-workspace-name]')!;

	expect(mark.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	// no access on any card, in either of the words it could be said in.
	expect(document.querySelector('[data-workspace-access]')).toBeNull();
	for (const id of ['ws-1', 'ws-2']) {
		expect(card(id)?.textContent, id).not.toContain(en.organization.dashboard.accessFull);
		expect(card(id)?.textContent, id).not.toContain(en.organization.dashboard.accessReadOnly);
	}
});

// criterion 21: the section says what it is for in the tray above the cards, the shape the members
// directory and the contracts view take.
test('the section says what it is for, in the tray above the cards', () => {
	list();

	const tray = document.querySelector('[data-directory-tray]')!;

	expect(tray.querySelector('legend')?.textContent?.trim()).toBe(en.settings.section.workspaces);
	expect(tray.querySelector('[data-directory-description]')?.textContent?.trim()).toBe(
		en.organization.dashboard.workspacesDescription
	);

	// above the cards, not around them.
	const first = document.querySelector('[data-workspace]')!;

	expect(tray.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(tray.contains(first)).toBe(false);
});

// criterion 21: new workspace is the owner's, and it needs the Turso authority as well, because
// creating a database is done on the machine that holds the consent.
test('new workspace stands in the tray for the owner holding the authority, and opens the shell dialog', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.layout.workspaceMenu.create });
	const tray = document.querySelector('[data-directory-tray]')!;
	const first = document.querySelector('[data-workspace]')!;

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
	expect(organizationDialog.open).toBe('workspace');
	// no form of its own: the one instance is mounted in the shell.
	expect(surface()).toBeNull();
});

test('an owner whose machine lost the authority reads why in the tray, and everybody else is offered neither', () => {
	const owner = list({
		canCreate: false,
		refusal: en.layout.workspaceMenu.workspaceRefusedAuthority
	});

	const tray = document.querySelector('[data-directory-tray]')!;
	const said = document.querySelector('[data-workspace-refusal]')!;

	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(said.textContent?.trim()).toBe(en.layout.workspaceMenu.workspaceRefusedAuthority);
	// in the control's place, which is where the act is looked for.
	expect(tray.contains(said)).toBe(true);
	owner.unmount();

	// an administrator never had a create to be refused, so the section says nothing about one.
	list({ canCreate: false, refusal: null });

	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-refusal]')).toBeNull();
});

// criterion 21: rename, members and delete on the card's menu, each behind its gate.
test('an owner holding every gate is offered members and delete on each card, and edit on the open one', async () => {
	list();

	expect(await actsOn('ws-1')).toEqual(['edit', 'grant', 'delete']);
	// the name's edit acts on the workspace this machine has open, so it is offered on that card alone.
	expect(await actsOn('ws-2')).toEqual(['grant', 'delete']);
});

test('a member holding no act is offered no menu at all, and no create control', () => {
	list({
		canCreate: false,
		canDelete: false,
		canRename: false,
		canGrantWorkspace: false
	});

	for (const id of ['ws-1', 'ws-2']) {
		expect(control(id), id).toBeNull();
	}
	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-refusal]')).toBeNull();
});

// each gate on its own, so no entry is being carried by a neighbour's.
test('each act is drawn by its own gate and by no other', async () => {
	const only = async (
		overrides: Partial<Parameters<typeof render<typeof Workspaces>>[1]>,
		id: string,
		offered: string[]
	) => {
		const rendered = list({
			canCreate: false,
			canDelete: false,
			canRename: false,
			canGrantWorkspace: false,
			...overrides
		});

		expect(await actsOn(id), `${id} ${JSON.stringify(overrides)}`).toEqual(offered);
		rendered.unmount();
	};

	await only({ canRename: true }, 'ws-1', ['edit']);
	await only({ canRename: true }, 'ws-2', []);
	await only({ canGrantWorkspace: true }, 'ws-1', ['grant']);
	await only({ canGrantWorkspace: true }, 'ws-2', ['grant']);
	await only({ canDelete: true }, 'ws-1', ['delete']);
	await only({ canDelete: true }, 'ws-2', ['delete']);
});

// [[rules/interface]], *Row activation*: activating a card opens its record, which for a workspace
// is this section's address with the workspace named on it.
test('a card opens its own record, and nothing on the card itself does anything else', async () => {
	list();

	const jeddah = card('ws-2')!;
	const opens = jeddah.querySelector('a')!;

	expect(opens.getAttribute('href')).toBe('/settings?section=workspaces&workspace=ws-2');
	expect(opens.getAttribute('aria-label')).toBe('Jeddah');
	// the acts are behind the card's one control, and nothing else on it is pressable.
	expect(jeddah.querySelectorAll('button')).toHaveLength(1);
	expect(jeddah.querySelectorAll('a')).toHaveLength(1);
	// and nothing left that a reader has to hover to find: the one control answers a press with no
	// pointer having been over the card, which is what *reachable without hovering* means to
	// somebody reading the section. *This read the card's markup for `opacity-0`, which passes on
	// any other way of hiding a control and fails on any other use of the class.*
	expect(document.querySelector('[data-workspace-actions]')).toBeNull();

	const trigger = jeddah.querySelector<HTMLButtonElement>('button')!;

	expect(trigger.hidden).toBe(false);
	expect(trigger.getAttribute('aria-hidden')).toBeNull();
	await fireEvent.click(trigger);
	expect(document.querySelectorAll('[data-slot=dropdown-menu-item]').length).toBeGreaterThan(0);
});

// the other half of the same rule: the section reads the workspace off the address and opens its
// edit, then clears it, so pressing the same card twice opens the same surface twice.
test('the address naming a workspace opens that workspace and is cleared', async () => {
	at('?section=workspaces&workspace=ws-2');
	list();

	await waitFor(() => {
		expect(document.querySelector('[data-access-form]')).not.toBeNull();
	});
	expect(
		screen.getByText(
			en.organization.dashboard.workspaceAccessDescription.replace('{workspace:string}', 'Jeddah')
		)
	).toBeDefined();
	expect(navigations).toEqual(['/settings?section=workspaces']);
});

// a reader who may only rename opens the one workspace they can rename, and a name nobody here
// holds opens nothing at all.
test('the edit a card opens is the one this reader holds, and an unknown name opens nothing', async () => {
	at('?section=workspaces&workspace=ws-1');
	const renamer = list({ canGrantWorkspace: false, canDelete: false });

	await waitFor(() => {
		expect(surface()).not.toBeNull();
	});
	expect(screen.getByText(en.workspace.renameDescription)).toBeDefined();
	renamer.unmount();
	resetOrganizationHost();

	at('?section=workspaces&workspace=ws-gone');
	list();

	expect(document.querySelector('[data-access-form]')).toBeNull();
	expect(surface()).toBeNull();
});

// criterion 21: export and import stay, in this section, acting on the open workspace.
test('export and import sit beneath the cards, under a legend naming the open workspace', () => {
	list();

	expect(screen.getByRole('button', { name: en.common.actions.export })).toBeDefined();
	expect(screen.getByRole('button', { name: en.common.actions.import })).toBeDefined();

	const legend = screen.getByText(
		en.organization.dashboard.transferTitle.replace('{workspace:string}', 'Riyadh')
	);
	const last = document.querySelectorAll('[data-workspace]')[1]!;

	expect(legend.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
	expect(screen.getByText(en.workspace.transferDescription)).toBeDefined();
});

test('the members act opens the access dialog on the people who could hold that workspace', async () => {
	list();

	await press('ws-2', 'grant');

	expect(document.querySelector('[data-access-form]')).not.toBeNull();
	// the owner's own grant is never withdrawn and the reader never writes their own row, so
	// neither is offered; what is left is everybody a grant can be moved on.
	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((node) =>
			node.getAttribute('data-access-row')
		)
	).toEqual(['ada', 'sami']);
	expect(
		screen.getByText(
			en.organization.dashboard.workspaceAccessDescription.replace('{workspace:string}', 'Jeddah')
		)
	).toBeDefined();
});

test('the members act hands up the rows that changed, as member ids on that workspace', async () => {
	list();

	await press('ws-2', 'grant');
	await fireEvent.click(
		within(document.querySelector<HTMLElement>('#access-ada')!).getByRole('radio', {
			name: en.organization.dashboard.accessFull
		})
	);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-2', memberId: 'ada', access: 'full-access' }] }
			}
		]);
	});
});

// criterion 21: delete asks once and names what is lost, and it is the owner's.
test('delete opens the packaged confirm, naming the workspace and what goes with it', async () => {
	list();

	await press('ws-2', 'delete');

	expect(dialogTitle()).toBe(toTitleCase(en.organization.dashboard.deleteWorkspace));
	expect(dialogParagraphs()[0]?.textContent?.trim()).toBe('Jeddah');
	expect(dialogParagraphs()[1]?.textContent?.trim()).toBe(
		en.organization.dashboard.deleteWorkspaceDescription
	);
	// it asks, and nothing is written until it is answered.
	expect(organizationHostState.workspace.deleting?.workspace.id).toBe('ws-2');
	expect(hostAnswers.writes).toEqual([]);
});

test('the edit opens the light form surface on the open workspace, with one name field', async () => {
	list();

	await press('ws-1', 'edit');

	expect(surface()).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.workspace.renameDescription)).toBeDefined();
	const fields = Array.from(surface()!.querySelectorAll<HTMLInputElement>('input'));

	expect(fields).toHaveLength(1);
	expect(fields[0]?.value).toBe('Riyadh');
});

// the menu's words are one plain word apiece, and the two that name something the application
// already has a word for draw the key that holds it.
test('the acts read as one plain word each, in the words the rest of the application uses', async () => {
	list();

	await fireEvent.click(control('ws-1')!);

	// one verb per act (effort 832, requirement 6): the name's entry is the edit every record has.
	expect(on('edit', 'ws-1')?.textContent?.trim()).toBe(toTitleCase(en.common.actions.edit));
	expect(on('grant', 'ws-1')?.textContent?.trim()).toBe(
		toTitleCase(en.organization.dashboard.membersTitle)
	);
	expect(on('delete', 'ws-1')?.textContent?.trim()).toBe(toTitleCase(en.common.actions.delete));
	expect(on('delete', 'ws-1')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('edit', 'ws-1')?.getAttribute('data-variant')).toBe('default');
});

test('and in arabic every card reads in its own words, right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(
		Array.from(document.querySelectorAll('[data-workspace-name]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['Riyadh', 'Jeddah']);
	expect(on('open', 'ws-1')?.textContent?.trim()).toBe(ar.layout.workspaceMenu.open);
	expect(document.querySelector('[data-directory-description]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.workspacesDescription
	);
	expect(ar.organization.dashboard.workspacesDescription).not.toBe(
		en.organization.dashboard.workspacesDescription
	);
	expect(screen.getByRole('button', { name: ar.layout.workspaceMenu.create })).toBeDefined();
	expect(
		screen.getByText(ar.organization.dashboard.transferTitle.replace('{workspace}', 'Riyadh'))
	).toBeDefined();

	await fireEvent.click(control('ws-1')!);

	expect(on('grant', 'ws-1')?.textContent?.trim()).toBe(ar.organization.dashboard.membersTitle);

	setLocale('en');
});

// --- Search and order (effort 832, requirement 7) ------------------------------------------------

/** the workspaces the directory is showing, by id, in the order it shows them. */
const shownWorkspaces = () =>
	Array.from(document.querySelectorAll('[data-workspace]')).map((held) =>
		held.getAttribute('data-workspace')
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
	const everything = shownWorkspaces();

	await typeSearch(workspaces[1].name);
	await insideTheWait();
	expect(shownWorkspaces()).toEqual(everything);

	await pastTheWait();
	expect(shownWorkspaces()).toEqual([workspaces[1].id]);
});

test('the search key puts the cursor in the directory’s field', async () => {
	list();

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});

// search keeps folding digits: a name holding Western digits is found by the Arabic-Indic ones an
// Arabic keyboard types, as a list's read finds it in SQL.
test('a term typed in Arabic-Indic digits finds a name written in Western ones', async () => {
	list({
		workspaces: [
			{ ...workspaces[0], id: 'tower-12', name: 'Tower 12' },
			{ ...workspaces[1], id: 'tower-7', name: 'Tower 7' }
		]
	});

	await typeSearch('١٢');
	await pastTheWait();

	expect(shownWorkspaces()).toEqual(['tower-12']);
});

test('the directory is ordered by name, then by how many hold each', async () => {
	list();

	await orderBy(en.common.labels.name);
	const byName = [...workspaces].sort((one, other) => (one.name < other.name ? -1 : 1));
	expect(shownWorkspaces()).toEqual(byName.map((workspace) => workspace.id));

	const holding = (id: string) =>
		members.filter((held) => held.workspaces.some((workspace) => workspace.id === id)).length;
	const byCount = [...workspaces].sort((one, other) => holding(one.id) - holding(other.id));

	expect(holding(byCount[0].id)).toBeLessThan(holding(byCount[1].id));
	await orderBy(en.organization.dashboard.membersTitle);
	expect(shownWorkspaces()).toEqual(byCount.map((workspace) => workspace.id));
});

// the settings directories offer nothing to export: the file a workspace becomes is the transfer
// beneath the cards, not the directory's.
test('the directory offers no transfer of its records', () => {
	list();

	expect(screen.queryByRole('button', { name: en.common.actions.transferData })).toBeNull();
});

// ticket 30 of effort 832: the tray orders its controls as the list shell's bar does, and the
// sentence under the legend is muted like every other description.
test('the tray orders search, count, sort and create as the list shell does', () => {
	list();

	expectBarOrder([BAR_CONTROL.search, BAR_CONTROL.count, BAR_CONTROL.sort, BAR_CONTROL.create]);
	expect(document.querySelector('[data-directory-description]')?.className).toContain(
		'text-muted-foreground'
	);
});
