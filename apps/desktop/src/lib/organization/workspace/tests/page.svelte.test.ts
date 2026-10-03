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

/**
 * A WORKSPACE'S PAGE
 *
 * Ticket 49 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1
 * as revised 2026-10-03, at the human's word: "manage members in the workspaces the form looks bad
 * the switch it needs to be a better looking maybe a page details like how records have pages
 * record and dicreocty of members and at the top information". A workspace's card opens its page
 * the way a complex's card opens its own: what the workspace is at the top, with the card's acts,
 * and a directory of the members who could hold it below, each in or out by a switch named for
 * them, applied at once (requirement 4).
 *
 * **It is the member's card read from the other end**, and the refusals are that card's
 * (`accessRefusalOf`): putting somebody in a workspace the reader holds read only is refused, and
 * every switch is refused, naming `grantWorkspace`, for a reader without it. A person tailored here
 * is marked *custom here*; the tailoring itself is on their card. The owner and the reader are not
 * listed. *These were the tests of the dialog the page replaced
 * (`access/tests/dialog.svelte.test.ts`), moved here with it.*
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
	Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
		row.getAttribute('data-access-row')
	);
const inSwitch = (id: string) =>
	document.querySelector<HTMLElement>(`[data-access-switch="${id}"]`);
const mark = (id: string) => document.querySelector<HTMLElement>(`[data-access-mark="${id}"]`);
const checked = (element: HTMLElement | null) => element?.getAttribute('aria-checked') === 'true';
const dimmed = (element: HTMLElement | null) => element?.getAttribute('aria-disabled') === 'true';
const reasons = () =>
	Array.from(document.querySelectorAll('[data-access-refusal]')).map((line) =>
		line.textContent?.trim()
	);
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

// criterion: every holdable member is listed, the owner and the reader not.
test('every member who could hold it is listed with a switch named for them, the owner not', () => {
	open('ws-1');

	expect(holderIds()).toEqual(['ada', 'sami']);
	expect(inSwitch('ada')?.getAttribute('role')).toBe('switch');
	expect(inSwitch('ada')?.getAttribute('aria-label')).toBe('ada');
	expect(checked(inSwitch('ada'))).toBe(true);
	expect(checked(inSwitch('sami'))).toBe(false);
	// the state is in words as well as in the switch's position.
	expect(
		document.querySelector('[data-access-row="ada"] [data-access-state]')?.textContent?.trim()
	).toBe(en.organization.workspacePage.isIn);
	expect(
		document.querySelector('[data-access-row="sami"] [data-access-state]')?.textContent?.trim()
	).toBe(en.organization.workspacePage.isOut);
	// a member is drawn as one, with their initials and their role.
	expect(document.querySelector('[data-access-row="ada"] [data-slot="avatar"]')).not.toBeNull();
	expect(
		document.querySelector('[data-access-row="ada"] [data-member-role]')?.textContent?.trim()
	).toBe('manager');
	expect(reasons()).toEqual([]);
});

test('the reader is not listed: their own row is not theirs to write', () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'ada',
		role: 'manager',
		permissions: maskOf(...EVERY_FLAG),
		workspaces
	});
	open('ws-1');

	expect(holderIds()).toEqual(['sami']);
});

// requirement 4: a switch applies at once, through the mutation the dialog wrote through.
test('switching a member on puts them in at full access, at once', async () => {
	open('ws-1');

	await fireEvent.click(inSwitch('sami')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-1', memberId: 'sami', access: 'full-access' }] }
			}
		]);
	});
	expect(checked(inSwitch('sami'))).toBe(true);
	expect(document.querySelector('form')).toBeNull();
});

test('switching a member off takes them out, at once', async () => {
	open('ws-1');

	await fireEvent.click(inSwitch('ada')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-1', memberId: 'ada', access: 'none' }] }
			}
		]);
	});
});

// requirement 4: a choice that fails is put back, and the shared handler says why.
test('a switch the shell refuses is put back', async () => {
	hostAnswers.refusals.useChangeAccess = new Error('refused');
	open('ws-1');

	await fireEvent.click(inSwitch('sami')!);

	await waitFor(() => expect(hostAnswers.writes).toHaveLength(1));
	await waitFor(() => expect(checked(inSwitch('sami'))).toBe(false));
});

// requirement 12 as amended a third time: a person whose permissions here differ from theirs
// across the organization is marked, read with their switch.
test('a person tailored here is marked custom here, read with their switch', () => {
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
		members[2]
	];
	open('ws-1');

	expect(mark('ada')?.textContent?.trim()).toBe(en.organization.workspaceSwitches.customHere);
	expect(inSwitch('ada')?.getAttribute('aria-describedby')).toContain(
		mark('ada')!.getAttribute('id')
	);
	expect(mark('sami')).toBeNull();
});

// a granter gives only what they reach: where the reader holds this workspace read only, nobody
// can be put in. Taking somebody out is still theirs.
test('a workspace the reader holds read only puts nobody in, and still withdraws', async () => {
	hostAnswers.members = [
		members[0],
		member({ id: 'ada', username: 'ada', workspaces: [{ id: 'ws-2', ...everywhere }] }),
		members[2]
	];
	open('ws-2');

	const reason = en.organization.workspaceSwitches.notHeld;

	expect(dimmed(inSwitch('sami'))).toBe(true);
	expect(reasons()).toContain(reason);
	await fireEvent.click(inSwitch('sami')!);
	expect(checked(inSwitch('sami'))).toBe(false);
	expect(hostAnswers.writes).toEqual([]);

	expect(dimmed(inSwitch('ada'))).toBe(false);
	await fireEvent.click(inSwitch('ada')!);

	await waitFor(() => {
		expect(hostAnswers.writes).toEqual([
			{
				hook: 'useChangeAccess',
				input: { changes: [{ workspaceId: 'ws-2', memberId: 'ada', access: 'none' }] }
			}
		]);
	});
});

// the workspace card's members act is refused without `grantWorkspace`; on the page every switch
// is, naming it, as the member's card refuses its workspaces.
test('a reader without grantWorkspace reads every switch refused, naming it', async () => {
	hostAnswers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0,
		workspaces
	});
	hostAnswers.members = [members[0], members[1], member({ id: 'sami', username: 'sami' })];
	open('ws-1');

	expect(holderIds()).toEqual(['ada']);
	expect(dimmed(inSwitch('ada'))).toBe(true);
	expect(reasons()).toEqual([lacking(i18nObject('en'), 'grantWorkspace')]);

	await fireEvent.click(inSwitch('ada')!);
	expect(hostAnswers.writes).toEqual([]);
});

test('with nobody to list it says there is no member to put in', () => {
	hostAnswers.members = [members[0]];
	open('ws-1');

	expect(document.querySelector('[data-access-empty]')?.textContent?.trim()).toBe(
		en.organization.dashboard.noMemberToGrant
	);
});

test('and in arabic the page reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	open('ws-2', 'rtl');

	expect(
		document.querySelector('[data-access-row="sami"] [data-access-state]')?.textContent?.trim()
	).toBe(ar.organization.workspacePage.isOut);
	expect(ar.organization.workspacePage.isOut).not.toBe(en.organization.workspacePage.isOut);
	expect(reasons()).toEqual([ar.organization.workspaceSwitches.notHeld]);
	expect(fact('access')?.textContent).toContain(ar.organization.dashboard.workspaceYouOwn);

	setLocale('en');
});
