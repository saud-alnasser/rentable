import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { sectionsOn } from '$lib/app/surfaces';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type {
	MemberStanding,
	OrganizationMember,
	OrganizationRole,
	OrganizationSession
} from '$lib/organization/host';
import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import {
	fakeOrganizationMember,
	fakeOrganizationSession
} from '$lib/organization/tests/testing.ts';
import OrganizationHost from '$lib/organization/component/host.svelte';
import { memberHost, organizationHostState } from '$lib/organization/host.svelte';
import type { RemoteSyncState } from '$lib/sync/host';
import type { AvailableUpdate } from '$lib/update';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';
import SettingsArea from '$lib/settings/component/area.svelte';
import { SECTION_GLYPH } from '$lib/settings/glyph';
import { resetUpdateDownload } from '$lib/settings/update-download.svelte';
import settingsSurface from '$lib/settings/surface';
import type { AddressableSection } from '$lib/settings/section';
import Providers from '#tests/providers.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { pressSearchKey } from '$lib/list/tests/search';
import { BUILT_IN, EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import { listenForSignOut } from '$lib/sync';
import { layOutLists } from '#tests/permission.ts';
import { expectTheEye } from '#tests/password-eye.ts';

/**
 * THE SETTINGS AREA, RENDERED
 *
 * Criterion 14 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] and
 * criterion 24 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], read
 * where they can be read: the area is drawn with the sections the window contributes to it
 * (`sectionsOn('settings')`, as the route hands them), so two sessions are two renders, and what
 * each reader is offered is whatever reached the rail. A route could not be asked this, since no
 * route renders under this runner.
 *
 * **Here, in the composition root's tests**, because what is read is the area and the
 * organization's sections together, which only `app/` puts side by side (effort 840): the area
 * names no feature, and the sections read the organization's queries for themselves. Those reads
 * are the organization host's hooks stood in for (`organization/tests/host-hooks.ts`), so a
 * session, the members and the sync record are what the hooks answer.
 *
 * **Each section is read by its blocks' marks and by the absence of the others'**, rather than by
 * the tab that is underlined: the rail says what a reader may open, and the body is what they
 * actually meet.
 *
 * **The address is the mock**, because that is where a section is named. `$app/state` is
 * supplied by the SvelteKit plugin and carries no navigation here, so the one member the two
 * directories read is stood in for and moved between tests.
 */

const { address, updater } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings') },
	/** what a check for updates finds: nothing, unless a test stands a release here. */
	updater: { next: null as AvailableUpdate | null }
}));

// the updater is the shell's, so a check answers what the test stood there and nothing installs.
vi.mock('$lib/update/ui', () => ({
	useCheckForUpdate: () => ({ mutateAsync: async () => updater.next }),
	usePrepareUpdate: () => ({ mutateAsync: async () => {} }),
	useRestartApp: () => ({ mutateAsync: async () => {} })
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return address.url;
		}
	}
}));

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

vi.mock('$lib/organization/setup/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/setup/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).syncHooks
}));

beforeEach(() => {
	resetHostAnswers();
	updater.next = null;
	// where the update stands outlives the card, so each test starts from a session that has asked
	// nothing yet.
	resetUpdateDownload();
	// the workspaces directory lays its tiles in as many columns as its width holds, which it
	// measures.
	layOutLists();
});

const noop = () => {};
const resolved = async () => {};

/** the reader is standing at this section of the area. */
const at = (search = '') => {
	address.url = new URL(`http://localhost/settings${search}`);
};

/**
 * what a render varies: the section the address named, and what the reads answer. The reads are
 * the route's and the sections' own, so they are answered by the hooks rather than handed as
 * props.
 */
type Standing = {
	section: AddressableSection;
	session: OrganizationSession | null;
	holdsTursoAuthority: boolean;
	syncState: RemoteSyncState | null;
	members: OrganizationMember[];
	standings: MemberStanding[];
	roles: OrganizationRole[];
};

const area = (overrides: Partial<Standing> = {}) => {
	loadLocale('en');
	setLocale('en');

	const standing: Standing = {
		section: 'general',
		session: fakeOrganizationSession({ permissions: BUILT_IN.manager.mask }),
		holdsTursoAuthority: true,
		syncState: fakeSyncState(),
		members: [],
		standings: [],
		roles: [],
		...overrides
	};

	hostAnswers.session = standing.session;
	hostAnswers.holdsTursoAuthority = standing.holdsTursoAuthority;
	hostAnswers.syncState = standing.syncState;
	hostAnswers.members = standing.members;
	hostAnswers.standings = standing.standings;
	hostAnswers.roles = standing.roles;

	return render(
		SettingsArea,
		{
			section: standing.section,
			settings: fakeSettings(),
			signedIn: standing.session !== null,
			sections: sectionsOn('settings'),
			onChangeLocale: noop,
			onRevealDiagnostics: noop,
			leaveForTheWall: resolved
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);
};

/** the section switch's anchors, in the order they were drawn. */
const tabs = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-section-switch] a')];

const tabNames = () => tabs().map((tab) => tab.textContent?.trim());

/**
 * the marks named, in the order the document holds them, leaving out the ones that are absent.
 *
 * Order within a section is a thing a reader meets rather than a prop, so it is read off the
 * document: a block moved in the template but left in the wrong place would pass every assertion
 * that only asks whether a mark is present.
 */
const orderOf = (...marks: string[]) =>
	[...document.querySelectorAll<HTMLElement>(marks.map((mark) => `[${mark}]`).join(','))]
		.map((element) => marks.find((mark) => element.hasAttribute(mark)))
		.filter((mark) => mark !== undefined);

/** the general section's groups of rows, in order. */
const generalGroups = () => [...document.querySelectorAll<HTMLElement>('[data-settings-group]')];

/** the general section's rows, in order. */
const generalRows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];

/** a settings row's name, as its title draws it, without the badge that may stand beside it. */
const rowName = (row: Element) =>
	row.querySelector('[data-slot=item-title] > span:first-child')?.textContent?.trim();

// criterion 14(c) of effort 832: the settings sections switch with the one control a record's
// sections switch with, the design package's section switch, rather than a row of their own.
test('the sections switch with the shared section switch, named for the area', () => {
	at('?section=account');
	area({ section: 'account' });

	const control = document.querySelectorAll<HTMLElement>('nav[data-section-switch]');

	expect(control).toHaveLength(1);
	expect(control[0]?.getAttribute('aria-label')).toBe(en.settings.title);
	expect(tabs().map((tab) => tab.dataset.section)).toEqual([
		'general',
		'account',
		'organization',
		'workspaces'
	]);
	expect(
		tabs()
			.find((tab) => tab.dataset.section === 'account')
			?.getAttribute('aria-current')
	).toBe('page');
});

// requirement 24 of effort 828: four sections, each named for what it holds.
test('an owner is offered the four sections, in order', () => {
	at();
	area();

	expect(tabNames()).toEqual([
		en.settings.section.general,
		en.settings.section.account,
		en.settings.section.organization,
		en.settings.section.workspaces
	]);
});

// the tabs are anchors rather than a tab list, because every section is addressable: a menu row,
// the palette and a bookmark all open one by this address.
test('each tab is an anchor carrying its own section in the address', () => {
	at();
	area();

	expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
		'/settings?section=general',
		'/settings?section=account',
		'/settings?section=organization',
		'/settings?section=workspaces'
	]);
});

// requirement 1 of effort 846: the switch names each section with a glyph beside its word, and it
// is the glyph the command menu draws that section's row with, since both read `glyph.ts`.
test('each tab leads with the glyph its command menu row carries', () => {
	at();
	area();

	expect(
		tabs().map((tab) => tab.firstElementChild?.getAttribute('class')?.match(/lucide-[a-z-]+/g))
	).toEqual([
		['lucide-icon', 'lucide-sliders-horizontal'],
		['lucide-icon', 'lucide-circle-user'],
		['lucide-icon', 'lucide-users'],
		['lucide-icon', 'lucide-building']
	]);

	const menu = (settingsSurface.places ?? []).flatMap((place) =>
		'icon' in place ? [place.icon] : []
	);

	expect(menu).toEqual(Object.values(SECTION_GLYPH));
});

// requirement 24: the gate moved from the section to the block inside it, so a member who
// changes nobody's row is offered every section and meets no directory.
test('a plain member is offered the same four', () => {
	at();
	area({ session: fakeOrganizationSession({ role: 'member', permissions: 0 }) });

	expect(tabNames()).toEqual([
		en.settings.section.general,
		en.settings.section.account,
		en.settings.section.organization,
		en.settings.section.workspaces
	]);
});

// the area is the one address that draws with nobody signed in, and general is the only section
// that needs no organization: the language and the appearance, updates and diagnostics.
test('with nobody signed in, the one section that needs no session', () => {
	at();
	area({ session: null, syncState: null, holdsTursoAuthority: false });

	expect(tabNames()).toEqual([en.settings.section.general]);
	expect(screen.getByText(en.settings.localeTitle)).toBeDefined();
	expect(screen.getByText(en.settings.updatesTitle)).toBeDefined();
	expect(screen.getByText(en.settings.diagnosticsTitle)).toBeDefined();
});

test('the section the address names is the one marked, and the only one', () => {
	at('?section=workspaces');
	area({ section: 'workspaces' });

	const marked = tabs().filter((tab) => tab.getAttribute('aria-current') === 'page');

	expect(marked).toHaveLength(1);
	expect(marked[0]?.textContent?.trim()).toBe(en.settings.section.workspaces);
});

test('and the body is that section rather than the first one', () => {
	at('?section=account');
	area({ section: 'account', session: fakeOrganizationSession({ username: 'ada.lovelace' }) });

	expect(screen.getByText('ada.lovelace')).toBeDefined();
	expect(screen.getByText(en.settings.you.password.title)).toBeDefined();
	expect(screen.queryByText(en.settings.localeTitle)).toBeNull();
});

// requirement 24 of effort 828 and requirements 1 and 3 of effort 846: general is three groups of
// rows, the language and the appearance, then updates, then diagnostics, each with its one line
// under it, and nothing that belongs to one of the other three sections. Ending soon is not among
// them: it is set from the dashboard (requirement 6, ticket 10).
test('the general section is three groups of rows: preferences, then updates, then diagnostics', () => {
	at('?section=general');
	area({ section: 'general' });

	expect(orderOf('data-general', 'data-updates', 'data-diagnostics')).toEqual([
		'data-general',
		'data-updates',
		'data-diagnostics'
	]);

	expect(
		generalGroups().map((group) => group.querySelectorAll('[data-settings-row]').length)
	).toEqual([2, 2, 1]);
	expect(generalRows().map(rowName)).toEqual([
		en.settings.localeTitle,
		en.settings.appearanceTitle,
		en.common.labels.currentVersion,
		en.common.labels.availableVersion,
		en.settings.diagnosticsFolder
	]);

	expect(screen.getByText(en.settings.updatesTitle)).toBeDefined();
	expect(screen.getByText(en.settings.updatesDescription)).toBeDefined();
	expect(screen.getByText(en.settings.diagnosticsTitle)).toBeDefined();
	expect(screen.getByText(en.settings.diagnosticsDescription)).toBeDefined();
	expect(screen.queryByText(en.dashboard.endingSoon.title)).toBeNull();
	expect(document.querySelector('input[type=number]')).toBeNull();

	// and none of the other three sections' blocks.
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(document.querySelector('[data-identity]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).toBeNull();
	expect(document.querySelector('[data-workspace]')).toBeNull();
});

// criterion 1 of effort 846, for general: every row leads with its glyph and says what it is.
test('every row in general has an icon and a name', () => {
	at('?section=general');
	area({ section: 'general' });

	expect(generalRows()).toHaveLength(5);

	for (const row of generalRows()) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
		expect(rowName(row)).toBeTruthy();
	}
});

// criterion 5 of effort 846, for general: a button among labelled, glyph-bearing neighbours with no
// glyph of its own is the odd one out. A segmented choice's segments are radios, not buttons, and
// are not counted.
test('within each group in general, every button carries an svg or none does', () => {
	at('?section=general');
	area({ section: 'general' });

	const withGlyph = generalGroups().map((group) =>
		within(group)
			.queryAllByRole('button')
			.map((button) => button.querySelector('svg') !== null)
	);

	for (const group of withGlyph) {
		expect(group.every(Boolean) || group.every((has) => !has)).toBe(true);
	}

	// updates' check and diagnostics' reveal are icon controls, each its glyph alone.
	expect(withGlyph.slice(1)).toEqual([[true], [true]]);
	expect(screen.getByRole('button', { name: en.common.actions.checkForUpdates })).toBeDefined();
	expect(screen.getByRole('button', { name: en.settings.diagnosticsReveal })).toBeDefined();
});

// criterion 4 of effort 846, for general: nothing in it waits on a save. Ending soon's was the last,
// and went with the figure to the dashboard (ticket 10).
test('no button in general is named save', () => {
	at('?section=general');
	area({ section: 'general' });

	const saves = screen
		.queryAllByRole('button')
		.filter((button) => button.textContent?.trim() === en.common.actions.save);

	expect(saves).toEqual([]);
});

// requirement 24: the account section is what the you section held, and nothing else.
test('the account section carries the blocks the you section held, and none of the others', () => {
	at('?section=account');
	area({ section: 'account' });

	expect(document.querySelector('[data-identity]')).not.toBeNull();
	expect(document.querySelector('[data-password]')).not.toBeNull();
	expect(document.querySelector('[data-machines]')).not.toBeNull();

	// who this reader is, then the one thing they change about themselves, then the machines signed
	// in as them, this one among them (effort 846, requirement 8 and ticket 46). No offer stands
	// here, so the section opens with the identity.
	expect(
		orderOf(
			'data-ownership-offer',
			'data-identity',
			'data-password',
			'data-machines',
			'data-sign-out'
		)
	).toEqual(['data-identity', 'data-password', 'data-machines']);

	expect(document.querySelector('[data-general]')).toBeNull();
	expect(document.querySelector('[data-updates]')).toBeNull();
	expect(document.querySelector('[data-diagnostics]')).toBeNull();
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).toBeNull();
	expect(document.querySelector('[data-workspace]')).toBeNull();
});

// requirement 24: the organization section is the people, the machine's standing, the Turso
// account with the delete, and the way out. Nothing of the other three is on it.
test('the organization section carries the directory, the account block and the delete', () => {
	at('?section=organization');
	area({ section: 'organization' });

	expect(document.querySelector('[data-members]')).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.membersTitle)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.authorityTitle)).toBeDefined();
	expect(document.querySelector('[data-forget-account-open]')).not.toBeNull();
	expect(document.querySelector('[data-delete-organization-open]')).not.toBeNull();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();

	expect(document.querySelector('[data-general]')).toBeNull();
	expect(document.querySelector('[data-updates]')).toBeNull();
	expect(document.querySelector('[data-diagnostics]')).toBeNull();
	expect(document.querySelector('[data-identity]')).toBeNull();
	expect(document.querySelector('[data-workspace]')).toBeNull();
});

// the organization's name, then how this machine stands to the organization, then the people,
// then the ways out, the Turso account the databases sit on first among them and the heaviest act
// last. Settled by the human on the real organization; the Turso account folded into leaving by
// ticket 38 ("Fold it into Leaving"); the name put first by effort 851.
test('the organization section is ordered: name, standing, people, leaving with the account in it', () => {
	at('?section=organization');
	area({ section: 'organization' });

	expect(
		orderOf(
			'data-organization-name',
			'data-standing-block',
			'data-members',
			'data-leaving',
			'data-turso-account',
			'data-forget-account-open',
			'data-disconnect',
			'data-delete-organization'
		)
	).toEqual([
		'data-organization-name',
		'data-standing-block',
		'data-members',
		'data-leaving',
		'data-turso-account',
		'data-forget-account-open',
		'data-disconnect',
		'data-delete-organization'
	]);

	// the acts at the foot stand under one title, so a reader knows what the last group is before
	// reading any of its lines.
	const leaving = document.querySelector('[data-leaving]')!;

	expect(leaving.querySelector('[data-settings-group] h2')?.textContent?.trim()).toBe(
		en.organization.dashboard.leavingTitle
	);
	expect(leaving.querySelector('[data-turso-account]')).not.toBeNull();
	expect(leaving.querySelector('[data-disconnect]')).not.toBeNull();
	expect(leaving.querySelector('[data-delete-organization]')).not.toBeNull();
	// and no card of its own for the account: the leaving card is the one that holds it.
	expect(
		[...document.querySelectorAll('[data-settings-group] h2')].map((h) => h.textContent?.trim())
	).not.toContain(en.organization.dashboard.authorityTitle);
});

// effort 851, criterion 22: the tab opens on the organization's name, and the edit that renames it
// is drawn for an owner session and for nobody else, neither a manager nor a member holding every
// flag, since no flag carries it.
test("the organization section opens on the organization's name, and the owner alone meets its edit", () => {
	at('?section=organization');

	for (const [session, drawn] of [
		[fakeOrganizationSession({ role: 'owner', permissions: BUILT_IN.owner.mask }), true],
		[
			fakeOrganizationSession({
				role: 'manager',
				roleId: 'manager',
				permissions: BUILT_IN.manager.mask
			}),
			false
		],
		[
			fakeOrganizationSession({
				role: 'member',
				roleId: 'member',
				permissions: maskOf(...EVERY_FLAG)
			}),
			false
		]
	] as const) {
		const { unmount } = area({ section: 'organization', session });
		const name = document.querySelector<HTMLElement>('[data-organization-name]')!;

		expect(orderOf('data-organization-name', 'data-standing-block', 'data-leaving')).toEqual([
			'data-organization-name',
			'data-standing-block',
			'data-leaving'
		]);
		expect(name.querySelector('h2')?.textContent?.trim()).toBe(session.organizationName);
		expect(name.querySelector('[data-organization-rename-open]') !== null, session.role).toBe(
			drawn
		);

		unmount();
	}
});

// criterion 12 of effort 846, from the area's side: the section opens with the sync group, a
// settings group whose one row names the state and says when this machine last reached Turso,
// with the control an icon named "sync" by its tooltip. Each state is read in
// `organization/tests/standing.svelte.test.ts`; what is read here is that the section draws that
// group, first, with the moment the machine holds.
test('the organization section opens with the sync group: the state, the last reach, and sync', async () => {
	at('?section=organization');
	area({
		section: 'organization',
		syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * 60_000 })
	});

	const block = document.querySelector<HTMLElement>('[data-standing-block]')!;

	expect(block).not.toBeNull();
	// the group's title, and its one line.
	expect(block.querySelector('[data-settings-group] h2')?.textContent?.trim()).toBe(
		en.organization.standing.title
	);
	expect(block.textContent).toContain(en.organization.standing.purpose);
	expect(block.querySelectorAll('[data-standing]')).toHaveLength(1);
	expect(rowName(block.querySelector('[data-standing]')!)).toBe(
		en.organization.standing.state.upToDate
	);
	expect(block.querySelector('[data-last-reached]')?.textContent?.trim()).toBe(
		en.organization.standing.lastReachedRecently.replace('{moment:string}', '2 minutes ago')
	);
	expect(block.querySelector('[data-slot="badge"]')).toBeNull();
	// and it is the first block of the section.
	expect(orderOf('data-standing-block', 'data-members', 'data-leaving')[0]).toBe(
		'data-standing-block'
	);

	// ticket 38 ("the sync button should be the icon only with tooltip maybe"): the glyph alone on
	// screen, its words its accessible name and its tooltip.
	const sync = within(block).getByRole('button', { name: en.organization.standing.checkNow });

	expect(sync.hasAttribute('data-check-now')).toBe(true);
	expect(sync.querySelector('svg')).not.toBeNull();
	expect(sync.textContent?.trim()).toBe('');
	expect(sync.getAttribute('aria-busy')).toBe('false');
	expect(await hintOf(sync, 'data-check-now-hint')).toBe(en.organization.standing.checkNow);
});

// an owner whose machine holds no authority meets the reconnect on the account's row in leaving,
// and no forget and no delete: both need the authority that row is about.
test('an owner holding no authority meets the reconnect, then the transfer and the disconnect', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(
		orderOf('data-standing-block', 'data-members', 'data-turso-account', 'data-disconnect')
	).toEqual(['data-standing-block', 'data-members', 'data-turso-account', 'data-disconnect']);
	expect(document.querySelector('[data-forget-account-open]')).toBeNull();
	expect(document.querySelector('[data-delete-organization]')).toBeNull();
	expect(document.querySelector('[data-delete-organization-open]')).toBeNull();
});

// requirement 24: an address outlives the arrangement that made it, so each retired name opens
// the section that took its blocks. What the route reads and what the area is handed are the
// same word, so the area reads it too.
test('an address naming a retired section opens the section that holds it', () => {
	at('?section=updates');
	area({ section: 'updates' });

	expect(document.querySelector('[data-updates]')).not.toBeNull();
	expect(
		tabs()
			.find((tab) => tab.getAttribute('aria-current') === 'page')
			?.textContent?.trim()
	).toBe(en.settings.section.general);

	at('?section=you');
	area({ section: 'you' });

	expect(document.querySelector('[data-identity]')).not.toBeNull();

	at('?section=sync');
	area({ section: 'sync' });

	expect(document.querySelector('[data-disconnect]')).not.toBeNull();

	at('?section=members');
	area({ section: 'members' });

	expect(document.querySelector('[data-members]')).not.toBeNull();
});

// criterion 22 of effort 826 and criteria 9 and 10 of effort 846: the account section lists the
// machines signed in as the reader, signs one out from its row's menu, and offers signing every
// other one out in the card's header, behind one confirm (ticket 46). What the rows hold and ask is `organization/session/tests/machines.svelte.test.ts`'s;
// what is read here is that the section draws them from its own read and writes through its own
// hooks.
test('the account section lists your machines and signs one out, or every other one, behind one confirm', async () => {
	at('?section=account');
	hostAnswers.machines = [
		{
			id: 'machine-here',
			name: "Olivia's Desk",
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: true,
			mayEndAlone: false
		},
		{
			id: 'machine-laptop',
			name: "Olivia's Laptop",
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: false,
			mayEndAlone: true
		}
	];
	area({ section: 'account' });

	const machines = document.querySelector<HTMLElement>('[data-machines]')!;

	expect([...machines.querySelectorAll('[data-settings-row]')].map(rowName).slice(0, 2)).toEqual([
		"Olivia's Desk",
		"Olivia's Laptop"
	]);
	expect(screen.getByText(en.settings.you.machines.title)).toBeDefined();
	expect(screen.getByText(en.settings.you.machines.description)).toBeDefined();
	// nothing has been asked yet, so nothing has been confirmed.
	expect(screen.queryByText(en.settings.you.sessions.confirmDescription)).toBeNull();

	// signing one out is in that machine's row's menu, so the card's one red is signing every other
	// machine out, a text in its header; there is no end row (requirement 2 as revised 2026-10-03).
	const header = machines.querySelector<HTMLElement>('[data-settings-group-header]')!;

	expect(machines.querySelectorAll('[data-row-tone=error]')).toHaveLength(0);
	expect(machines.querySelectorAll('[data-settings-row]')).toHaveLength(2);
	expect(machines.querySelectorAll('button[class*=text-destructive]')).toHaveLength(1);
	expect(header.querySelector('button[class*=text-destructive]')?.textContent?.trim()).toBe(
		en.settings.you.sessions.short
	);

	await fireEvent.click(machines.querySelector('[data-machine-menu=machine-laptop]')!);
	await fireEvent.click(
		document.querySelector('[data-slot=dropdown-menu-item][data-end-machine=machine-laptop]')!
	);

	const one = await screen.findByRole('dialog');

	expect(one.textContent).toContain("Olivia's Laptop");
	await fireEvent.click(within(one).getByRole('button', { name: en.common.actions.signOut }));
	await expect
		.poll(() => hostAnswers.writes)
		.toEqual([{ hook: 'useEndMachine', input: { machineId: 'machine-laptop' } }]);

	await fireEvent.click(machines.querySelector('[data-end-other-sessions-open]')!);

	expect(await screen.findByText(en.settings.you.sessions.confirmDescription)).toBeDefined();
});

/** the settings groups the section drew, in order. */
const groups = () => [...document.querySelectorAll<HTMLElement>('[data-settings-group]')];

/** this machine and one other, as the machines card lists them. */
const HERE_AND_LAPTOP = () => [
	{
		id: 'machine-here',
		name: 'Desk',
		seenAt: Date.now(),
		createdAt: Date.now(),
		isThisMachine: true,
		mayEndAlone: false
	},
	{
		id: 'machine-laptop',
		name: 'Laptop',
		seenAt: Date.now(),
		createdAt: Date.now(),
		isThisMachine: false,
		mayEndAlone: true
	}
];

// effort 846 ticket 46, at the human's word of 2026-10-03 ("the account sectio machiens and this
// machine merge them"; "the sinout of all feels od to be a complete section"): the account is three
// cards, the machines card last, with no card for this machine and no end row; the password card
// is its header alone, its act a quiet text at the trailing edge.
test('the account section has one machines card, and the password card acts from its header', () => {
	at('?section=account');
	hostAnswers.machines = HERE_AND_LAPTOP();
	area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	// the offer is a callout across the grid, and the identity, the password and the machines are
	// its three cards.
	expect(groups()).toHaveLength(3);
	expect(groups().at(-1)!.closest('[data-machines]')).not.toBeNull();
	expect(document.querySelector('[data-sign-out]')).toBeNull();
	expect(document.querySelectorAll('[data-row-tone=error]')).toHaveLength(0);

	// the password card: no footer, no rows, and its act in its header, named for the whole act.
	const password = document.querySelector<HTMLElement>('[data-password] [data-settings-group]')!;
	const change = password.querySelector<HTMLElement>(
		'[data-settings-group-header] [data-settings-group-action] [data-change-password-open]'
	)!;

	expect(password.querySelector('[data-settings-group-footer]')).toBeNull();
	expect(password.querySelector('[data-settings-row]')).toBeNull();
	expect(change.textContent?.trim()).toBe(en.settings.you.password.changeShort);
	expect(change.getAttribute('aria-label')).toBe(en.settings.you.password.change);
	expect(change.className).not.toMatch(/\btext-destructive\b/);
	expect(change.querySelector('svg')).toBeNull();

	// this machine is the machines card's first row, marked, with its own menu.
	const here = document.querySelector<HTMLElement>('[data-machines] [data-settings-row]')!;

	expect(here.querySelector('[data-this-machine]')).not.toBeNull();
	expect(here.querySelector('[data-machine-menu=machine-here]')).not.toBeNull();
});

// effort 851, at the human's word on 2026-10-06: "sign out is simple, just sign out". Signing this
// machine out from its row's menu asks nothing and asks the shell at once, the way the rail's menu
// does, and signing in again is what undoes it.
test('signing out of this machine asks no question and asks the shell at once', async () => {
	at('?section=account');
	hostAnswers.machines = HERE_AND_LAPTOP();
	area({ section: 'account' });

	let asked = 0;
	const stop = listenForSignOut(() => {
		asked += 1;
	});

	// this machine's row menu, and the entry that signs it out (ticket 46).
	await fireEvent.click(document.querySelector('[data-machine-menu=machine-here]')!);
	await fireEvent.click(
		document.querySelector('[data-slot=dropdown-menu-item][data-sign-out-open]')!
	);

	await waitFor(() => expect(asked).toBe(1));
	expect(document.querySelector('[data-confirm-dialog]')).toBeNull();
	stop();
});

// requirements 1, 2 and 5, criteria 1, 2 and 5 for the account section, with an offer standing so
// every group is drawn: every row leads with a glyph and has a name; within a group the buttons
// all carry a glyph or none does; the error tone is only on a row that is the last of its group.
test('every account row has a glyph and a name, and the buttons of a group agree on glyphs', () => {
	at('?section=account');
	hostAnswers.machines = HERE_AND_LAPTOP();
	area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	const rows = [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];

	// the identity and the password are a card's header and its act, so the rows are the
	// machines'.
	expect(rows.map(rowName)).toEqual(['Desk', 'Laptop']);

	for (const row of rows) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
		expect(rowName(row)).toBeTruthy();
	}

	for (const group of groups()) {
		// a row's menu control is the record menu's ellipsis, named for its row, and not one of the
		// group's worded acts.
		const buttons = [...group.querySelectorAll('button:not([data-machine-menu])')];
		const withGlyph = buttons.filter((button) => button.querySelector('svg') !== null);

		expect([0, buttons.length]).toContain(withGlyph.length);

		const inGroup = [...group.querySelectorAll<HTMLElement>('[data-settings-row]')];

		inGroup.forEach((row, index) => {
			if (row.dataset.rowTone === 'error') expect(index).toBe(inGroup.length - 1);
		});
	}

	// nothing in the account ends something from a row: this machine signs out from its menu and
	// every other one from the machines card's header (ticket 46).
	expect(rows.filter((row) => row.dataset.rowTone === 'error')).toEqual([]);
});

test('the area carries one title, and it is the area rather than the section', () => {
	at('?section=general');
	area({ section: 'general' });

	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.settings.title);
});

// criterion 14 and criterion 16: the owner's own item is the Turso account, and a plain member
// does not meet it. The status and the disconnect are everybody's, since a member reads whether
// their machine is reaching the workspace and leaves the organization from the same place the
// owner does. *These blocks were a section called sync until requirement 24 of effort 828.*
//
// **And there is no link block for anybody** (effort 828, criterion 16). The organization's own
// link stood here for the owner, named as the copy that recovered the organization when every
// machine was gone; requirement 16 retired it, because the way back is the owner's Turso account
// and their password, and nothing is minted that a found copy could read the directory with.
test('the owner is given the turso account and the disconnect, and no link', () => {
	at('?section=organization');
	area({ section: 'organization' });

	expect(screen.getByText(en.organization.dashboard.authorityTitle)).toBeDefined();
	expect(document.querySelector('[data-forget-account-open]')).not.toBeNull();
	expect(document.querySelector('[data-reconnect-authority-open]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(screen.getByText(en.organization.standing.state.notYetReached)).toBeDefined();
	expect(document.querySelector('[data-organization-link]')).toBeNull();
	expect(document.querySelector('[data-link-description]')).toBeNull();
});

// effort 828, requirement 18: the owner can end the organization from the same block the account
// is in, because it is the account the databases are on. Nobody else sees the control, and nothing
// about it is drawn until they ask: the question that follows is the shared form surface at its
// heavy weight, naming what goes and taking the password.
test('the owner is offered the delete, on a surface that says what goes and takes the password', async () => {
	at('?section=organization');
	area({ section: 'organization' });

	const control = document.querySelector('[data-delete-organization-open]');

	expect(control).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.deleteOrganizationDescription)).toBeDefined();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(0);
	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();

	await fireEvent.click(control!);
	await screen.findByText(en.organization.dashboard.deleteOrganizationGoes);

	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(1);
	expect(screen.getByText(en.organization.setup.passwordLabel)).toBeDefined();
	// effort 851, criterion 19: the password carries the eye.
	await expectTheEye(
		document.querySelector<HTMLInputElement>('#delete-organization-password'),
		strings.showPassword
	);
});

// the delete is the owner's whichever block it sits in: it stood in the account block and stands at
// the foot now, and the gate went with it.
test('a manager is offered no delete, because the act is the owners', () => {
	at('?section=organization');
	area({
		section: 'organization',
		session: fakeOrganizationSession({
			role: 'manager',
			permissions: BUILT_IN.manager.mask
		})
	});

	expect(document.querySelector('[data-delete-organization]')).toBeNull();
	expect(document.querySelector('[data-delete-organization-open]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.authorityTitle)).toBeNull();
	// and the section is still theirs to read: the status and the disconnect are everybody's, and
	// the foot is the disconnect alone under its legend.
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(document.querySelector('[data-leaving] [data-disconnect]')).not.toBeNull();
});

// requirement 5: the authority is restored from nowhere, so an owner on a machine that holds
// none is offered the consent again rather than the control that gives it back.
test('an owner whose machine holds no authority is offered the reconnect in its place', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(document.querySelector('[data-reconnect-authority-open]')).not.toBeNull();
	expect(document.querySelector('[data-forget-account-open]')).toBeNull();
	expect(document.querySelector('[data-turso-account]')?.textContent).toContain(
		en.organization.dashboard.authorityDescription
	);
});

// criterion 22: an owner who was handed the organization holds no authority either, and the reason
// is not that this machine lost one. The block says where the authority does belong, in one short
// sentence, and offers the same reconnect.
test('an owner holding no authority is told the authority follows the account that consented', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(document.querySelector('[data-turso-account]')?.textContent).toContain(
		en.organization.dashboard.authorityFollowsTheAccount
	);
	// and the offer beside it is the one that already existed.
	expect(document.querySelector('[data-reconnect-authority-open]')).not.toBeNull();
});

// and nobody else meets it: an owner whose machine holds the authority has nothing to be told, and
// a plain member never reads this block at all.
test('the sentence is absent for an owner who holds the authority', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: true });

	expect(document.querySelector('[data-turso-account]')?.textContent).not.toContain(
		en.organization.dashboard.authorityFollowsTheAccount
	);
});

/** the leaving card's rows that are about the Turso account: its state, and forgetting it. */
const tursoRows = () =>
	[...document.querySelectorAll<HTMLElement>('[data-leaving] [data-settings-row]')].filter(
		(row) =>
			row.hasAttribute('data-turso-account') ||
			row.querySelector('[data-forget-account-open]') !== null
	);

// effort 846, criterion 13 with 2 and 5, from the area's side, as ticket 38 folded the account into
// leaving: the owner whose machine holds the authority meets the Turso account as a row reading
// connected on this machine, first in the leaving card, and forgetting it as one of the card's
// ending rows, its button red words alone, asked first with the sentence naming where to revoke the
// token.
test('an owner holding the authority reads the turso account as connected, and forget among the ends', async () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: true });

	const [account, forget] = tursoRows();

	expect(leavingRows()[0]).toBe(account);
	expect(tursoRows().map(rowName)).toEqual([
		en.organization.dashboard.authorityTitle,
		en.organization.dashboard.forgetAccount
	]);
	expect(account.querySelector('[data-row-value]')?.textContent?.trim()).toBe(
		en.organization.dashboard.authorityConnected
	);
	expect(account.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(account.dataset.rowTone).toBe('neutral');
	expect(forget.dataset.rowTone).toBe('error');
	expect(forget.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(forget.querySelector('button svg')).toBeNull();

	await fireEvent.click(forget.querySelector('[data-forget-account-open]')!);

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokes);
	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokesAt);

	// and confirmed, it forgets the organization's own consent, never the setup walk's pending one,
	// which is what it reached until a review of effort 851 and which left the account held.
	await fireEvent.click(
		within(dialog).getByRole('button', { name: en.organization.dashboard.forgetAccount })
	);
	await expect
		.poll(() => hostAnswers.writes)
		.toEqual([{ hook: 'useForgetAuthority', input: undefined }]);
});

// and the owner whose machine does not: the row reads not held here and carries the reconnect, in
// words alone as every button in the card is, and there is no forget, since nothing is held to end.
test('an owner holding no authority reads the turso account as not held, with a reconnect in words', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	const [account] = tursoRows();

	expect(tursoRows()).toHaveLength(1);
	expect(rowName(account)).toBe(en.organization.dashboard.authorityTitle);
	expect(account.querySelector('[data-row-value]')?.textContent?.trim()).toBe(
		en.organization.dashboard.authorityNotHeld
	);
	expect(account.querySelector('[data-reconnect-authority-open]')).not.toBeNull();
	expect(account.querySelector('[data-reconnect-authority-open] svg')).toBeNull();
	expect(account.dataset.rowTone).toBe('neutral');
	expect(document.querySelector('[data-forget-account-open]')).toBeNull();
});

// effort 846, criterion 5 for the leaving card and the mark's: within each, every button carries a
// glyph or none does, held or not.
test('the leaving and mark groups agree on glyphs within each group', () => {
	for (const holdsTursoAuthority of [true, false]) {
		at('?section=organization');
		const { unmount } = area({ section: 'organization', holdsTursoAuthority, ...OWNER_AND_ADA });

		const ours = groups().filter(
			(group) =>
				group.closest('[data-leaving]') !== null ||
				group.closest('[data-organization-mark]') !== null
		);

		expect(ours).toHaveLength(2);

		for (const group of ours) {
			// a row's fold is a disclosure rather than an act, and carries its chevron wherever it is.
			const buttons = [...group.querySelectorAll('button:not([data-row-details-trigger])')];
			const withGlyph = buttons.filter((button) => button.querySelector('svg') !== null);

			expect([0, buttons.length]).toContain(withGlyph.length);
		}

		unmount();
	}
});

// requirement 24: a member's organization section draws what the sync section drew for them, and
// no directory. The gates did not change; the blocks they gate moved into one section.
test('a plain member reads the standing and the disconnect, and no directory or account', () => {
	at('?section=organization');
	area({
		section: 'organization',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 }),
		holdsTursoAuthority: false
	});

	expect(screen.getByText(en.organization.standing.state.notYetReached)).toBeDefined();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.membersTitle)).toBeNull();
	expect(document.querySelector('[data-forget-account-open]')).toBeNull();
	expect(document.querySelector('[data-reconnect-authority-open]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.authorityTitle)).toBeNull();
	expect(document.querySelector('[data-organization-link]')).toBeNull();

	// what is left is the standing and the way out, in that order.
	expect(orderOf('data-standing-block', 'data-members', 'data-leaving', 'data-disconnect')).toEqual(
		['data-standing-block', 'data-leaving', 'data-disconnect']
	);
	expect(document.querySelector('[data-delete-organization]')).toBeNull();
});

// effort 851, at the human's word ("there should be a menu to manage invites to revoke them from
// the app for who has the permissions for it"): the links waiting to be opened are a card under
// the people, drawn for a holder of either flag that makes a link, and for nobody else: not a
// member holding neither, and not a reader who holds them and is locked, whom the shell refuses.
test('the links waiting to be opened are drawn for whoever could make one, unlocked, and nobody else', () => {
	hostAnswers.links = [
		{
			id: 'link-sami',
			memberId: 'sami',
			username: 'sami.staff',
			purpose: 'join',
			madeBy: 'olivia',
			madeAt: Date.now(),
			expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000
		}
	];

	for (const flag of ['inviteMember', 'resetPassword'] as const) {
		at('?section=organization');
		const holder = area({
			section: 'organization',
			session: fakeOrganizationSession({
				role: 'custom',
				rank: 500_000,
				permissions: maskOf(flag)
			})
		});
		const card = document.querySelector('[data-links] [data-settings-group]');

		expect(card, flag).not.toBeNull();
		expect(card?.querySelector('h2')?.textContent?.trim()).toBe(en.organization.links.title);
		expect(card?.querySelector('[data-link="link-sami"]')).not.toBeNull();
		// under the people, and before the ways out.
		expect(orderOf('data-members', 'data-links', 'data-leaving')).toEqual([
			'data-members',
			'data-links',
			'data-leaving'
		]);
		holder.unmount();
	}

	at('?section=organization');
	const member = area({
		section: 'organization',
		session: fakeOrganizationSession({ role: 'member', permissions: BUILT_IN.member.mask })
	});

	expect(document.querySelector('[data-links]')).toBeNull();
	member.unmount();

	at('?section=organization');
	area({
		section: 'organization',
		session: fakeOrganizationSession({
			role: 'manager',
			rank: 1_000_000,
			permissions: BUILT_IN.manager.mask,
			locked: true
		})
	});

	expect(document.querySelector('[data-links]')).toBeNull();
});

/** the leaving group's rows, in order. */
const leavingRows = () => [
	...document.querySelectorAll<HTMLElement>('[data-leaving] [data-settings-row]')
];

/** the owner, and somebody whose password is set and who could take the organization. */
const OWNER_AND_ADA = {
	members: [
		fakeOrganizationMember({ id: 'member-owner', username: 'olivia', role: 'owner' }),
		fakeOrganizationMember({ id: 'ada', username: 'ada', role: 'manager' })
	],
	standings: [
		{ memberId: 'member-owner', passwordSet: true, machineSignedIn: true, locked: false },
		{ memberId: 'ada', passwordSet: true, machineSignedIn: false, locked: false }
	]
};

// effort 846, criterion 14 with 2: a member's leaving group holds disconnect this machine alone,
// with its glyph and the line saying the organization stays on Turso and a link brings them back,
// its button red words alone; no Turso account row and no forget (ticket 38).
test('a member leaves with the disconnect alone, its glyph and its consequence line', () => {
	for (const role of ['member', 'manager'] as const) {
		at('?section=organization');
		const { unmount } = area({
			section: 'organization',
			session: fakeOrganizationSession({ role, permissions: BUILT_IN[role].mask }),
			holdsTursoAuthority: false,
			...OWNER_AND_ADA
		});

		const rows = leavingRows();

		expect(rows.map(rowName), role).toEqual([en.organization.dashboard.disconnectThisMachine]);
		expect(rows[0].dataset.rowTone).toBe('error');
		expect(rows[0].querySelector('[data-slot=item-media] svg')).not.toBeNull();
		expect(rows[0].querySelector('button svg')).toBeNull();
		expect(rows[0].querySelector('button')?.className).toContain('text-destructive');
		expect(rows[0].querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
			en.organization.dashboard.disconnectComesBack
		);
		expect(document.querySelector('[data-leaving] [data-act]')).toBeNull();
		expect(document.querySelector('[data-turso-account]')).toBeNull();
		expect(document.querySelector('[data-forget-account-open]')).toBeNull();

		unmount();
	}
});

// effort 851, criterion 5: the leaving card's disconnect asks through the wall's confirm, and says
// the Turso account is forgotten only where this machine holds the organization's consent. An
// owner holding it is told; a member, and an owner whose consent is not here, are not.
test('the disconnect confirm says the turso account goes only where this machine holds it', async () => {
	const readers = [
		{ role: 'owner', holdsTursoAuthority: true, forgetsTurso: true },
		{ role: 'owner', holdsTursoAuthority: false, forgetsTurso: false },
		{ role: 'member', holdsTursoAuthority: false, forgetsTurso: false }
	] as const;

	for (const { role, holdsTursoAuthority, forgetsTurso } of readers) {
		const reader = `${role} ${holdsTursoAuthority ? 'holding' : 'without'} the consent`;

		at('?section=organization');
		const { unmount } = area({
			section: 'organization',
			session: fakeOrganizationSession({ role, permissions: BUILT_IN[role].mask }),
			holdsTursoAuthority,
			...OWNER_AND_ADA
		});

		await fireEvent.click(
			document.querySelector<HTMLElement>('[data-leaving] [data-disconnect-open]')!
		);

		const dialog = await screen.findByRole('dialog');
		const text = dialog.textContent ?? '';

		expect(text, reader).toContain(fakeOrganizationSession().organizationName);
		expect(text.includes(en.layout.signIn.disconnectDescription), reader).toBe(forgetsTurso);
		expect(text.includes(en.layout.signIn.disconnectDescriptionNoTurso), reader).toBe(
			!forgetsTurso
		);

		unmount();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	}
});

// and an owner's holds the Turso account's row, then the transfer, the forget, the disconnect
// and the delete, the acts as the group's error rows after its separator, the delete last and
// saying nothing undoes it. No two share a glyph or a line, and every act's button is red words
// alone (ticket 38: "hand over owenrhips should be named transfer ownership and the button should
// be transfer and in red and without icon the same for disconnect and delete").
test('an owner leaves by the transfer, then the forget and the disconnect, then the delete, last', () => {
	at('?section=organization');
	area({ section: 'organization', ...OWNER_AND_ADA });

	const rows = leavingRows();

	expect(rows.map(rowName)).toEqual([
		en.organization.dashboard.authorityTitle,
		en.organization.dashboard.transferOwnership,
		en.organization.dashboard.forgetAccount,
		en.organization.dashboard.disconnectThisMachine,
		en.organization.dashboard.deleteOrganization
	]);
	expect(en.organization.dashboard.transferOwnership).toBe('transfer ownership');
	expect(rows.map((row) => row.dataset.rowTone)).toEqual([
		'neutral',
		'error',
		'error',
		'error',
		'error'
	]);

	// the acts are the group's end, after its separator.
	const group = document.querySelector<HTMLElement>('[data-leaving] [data-settings-group]')!;
	const separator = group.querySelector('[data-slot=item-separator]')!;

	expect(
		separator.compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(
		rows[0].compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();

	const lines = rows
		.slice(1)
		.map((row) => row.querySelector('[data-leaving-consequence]')?.textContent?.trim());

	expect(lines).toEqual([
		en.organization.dashboard.transferGoes,
		en.organization.dashboard.forgetAccountDescription,
		en.organization.dashboard.disconnectForgets,
		en.organization.dashboard.deleteOrganizationDescription
	]);
	expect(lines[3]).toContain('nothing puts them back');

	const glyphs = rows.map((row) => row.querySelector('[data-slot=item-media] svg')?.outerHTML);

	expect(glyphs.every((glyph) => glyph !== undefined)).toBe(true);
	expect(new Set(glyphs).size).toBe(rows.length);

	// every act's button: its own word, red, and no glyph.
	const buttons = rows
		.slice(1)
		.map((row) => row.querySelector<HTMLElement>('[data-slot=item-actions] button')!);

	expect(buttons.map((button) => button.textContent?.trim())).toEqual([
		en.organization.dashboard.transfer,
		en.organization.dashboard.forget,
		en.organization.dashboard.disconnect,
		en.common.actions.delete
	]);
	expect(en.organization.dashboard.transfer).toBe('transfer');
	expect(buttons.every((button) => button.querySelector('svg') === null)).toBe(true);
	expect(buttons.every((button) => button.className.includes('text-destructive'))).toBe(true);
});

// and in arabic, the transfer reads as the act names it there.
test('the transfer reads in arabic', async () => {
	at('?section=organization');
	area({ section: 'organization', ...OWNER_AND_ADA });
	loadLocale('ar');
	setLocale('ar');
	await tick();

	const transfer = document.querySelector<HTMLElement>(
		'[data-leaving] [data-act="member.offerOwnership"]'
	)!;

	expect(transfer.textContent?.trim()).toBe(ar.organization.dashboard.transfer);
	expect(rowName(transfer.closest<HTMLElement>('[data-settings-row]')!)).toBe(
		ar.organization.dashboard.transferOwnership
	);

	loadLocale('en');
	setLocale('en');
});

// the handover is the owner's card's own act, run through the member host on the owner's own
// record, and what it opens is the offer form the card already opens.
test('pressing the handover runs the card act through the member host and opens the offer', async () => {
	const run = vi.spyOn(memberHost, 'run');

	at('?section=organization');
	render(OrganizationHost, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });
	area({ section: 'organization', ...OWNER_AND_ADA });

	const handover = document.querySelector<HTMLButtonElement>(
		'[data-leaving] [data-act="member.offerOwnership"]'
	)!;

	expect(handover.getAttribute('aria-disabled')).toBeNull();

	await fireEvent.click(handover);

	expect(run).toHaveBeenCalledTimes(1);
	expect(run.mock.calls[0][0]).toBe('member.offerOwnership');
	expect(run.mock.calls[0][1].member.id).toBe('member-owner');
	expect(organizationHostState.member.offering?.member.id).toBe('member-owner');
	expect(await screen.findByText(en.organization.dashboard.transferOwnershipGoes)).toBeDefined();
	expect(document.querySelector('[data-transfer-ownership-form]')).not.toBeNull();

	run.mockRestore();
	organizationHostState.member.offering = null;
});

// where nobody has set a password yet, the handover is still there, refused, saying so, and the
// press runs nothing.
test('with nobody to take it, the owner meets the handover refused, saying why', async () => {
	const run = vi.spyOn(memberHost, 'run');

	at('?section=organization');
	area({
		section: 'organization',
		members: OWNER_AND_ADA.members,
		standings: [
			{ memberId: 'member-owner', passwordSet: true, machineSignedIn: true, locked: false },
			{ memberId: 'ada', passwordSet: false, machineSignedIn: false, locked: false }
		]
	});

	const handover = document.querySelector<HTMLButtonElement>(
		'[data-leaving] [data-act="member.offerOwnership"]'
	)!;

	expect(handover.getAttribute('aria-disabled')).toBe('true');
	expect(
		document.getElementById(handover.getAttribute('aria-describedby')!)?.textContent?.trim()
	).toBe(en.organization.dashboard.nobodyOfferable);
	expect(en.organization.dashboard.nobodyOfferable).toContain('nobody has set a password yet');

	await fireEvent.click(handover);

	expect(run).not.toHaveBeenCalled();
	expect(organizationHostState.member.offering).toBeNull();

	run.mockRestore();
});

// while an offer stands, the handover's place holds its withdrawal, as the card's does.
test('while an offer stands, the leaving group offers its withdrawal in the handover place', () => {
	at('?section=organization');
	area({
		section: 'organization',
		members: [
			OWNER_AND_ADA.members[0],
			fakeOrganizationMember({
				id: 'ada',
				username: 'ada',
				role: 'manager',
				offeredOwnership: true
			})
		],
		standings: OWNER_AND_ADA.standings
	});

	const [, first] = leavingRows();

	expect(rowName(first)).toBe(en.organization.dashboard.withdrawOffer);
	expect(first.querySelector('[data-act="member.withdrawOffer"]')).not.toBeNull();
	expect(first.querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
		en.organization.dashboard.offerStandsGoes
	);
});

// the organization section draws two directories, the roles and the people, and answers the search
// key once ([[rules/interface]], *Search*): the people's field where they are drawn, since that is
// the set a reader searches, and the roles' where they are not.
test('the search key reaches the people where they are drawn, and the roles where they are not', async () => {
	const fieldOf = (legendId: string) =>
		document.querySelector(`[aria-labelledby="${legendId}"] [data-search-field] input`);

	at('?section=organization');
	const manager = area({ section: 'organization' });

	await pressSearchKey();
	expect(document.activeElement).toBe(fieldOf('members-legend'));
	manager.unmount();

	area({
		section: 'organization',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 })
	});

	await pressSearchKey();
	expect(fieldOf('members-legend')).toBeNull();
	expect(document.activeElement).toBe(fieldOf('roles-legend'));
});

// criterion 16 from the area's side: the section is the list this member holds, with the rows
// the workspaces section draws. What each row offers is read in
// `organization/workspace/tests/directory.svelte.test.ts`.
test('the workspaces section draws a row per workspace the session holds', () => {
	at('?section=workspaces');
	area({ section: 'workspaces' });

	expect(document.querySelectorAll('[data-workspace]')).toHaveLength(1);
	expect(document.querySelector('[data-workspace-name]')?.textContent?.trim()).toBe(
		'North Properties'
	);

	// and none of the other three sections' blocks.
	expect(document.querySelector('[data-general]')).toBeNull();
	expect(document.querySelector('[data-updates]')).toBeNull();
	expect(document.querySelector('[data-diagnostics]')).toBeNull();
	expect(document.querySelector('[data-identity]')).toBeNull();
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).toBeNull();
});

// effort 828, requirement 8: nothing about the password is on screen until the person asks to
// change it. The form was three empty fields drawn under a heading on every visit until then, and
// a write drawn inline is off the one rule every other write here follows.
test('the account section states the password and draws no field until the change is pressed', async () => {
	at('?section=account');
	area({ section: 'account' });

	expect(screen.getByText(en.settings.you.password.title)).toBeDefined();
	expect(screen.getByText(en.settings.you.password.description)).toBeDefined();
	expect(document.querySelector('[data-change-password-open]')).not.toBeNull();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(0);
	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();
	expect(screen.queryByText(en.organization.setup.passwordFloor)).toBeNull();

	await fireEvent.click(document.querySelector('[data-change-password-open]')!);

	const surface = await screen.findByText(en.organization.setup.passwordFloor);

	expect(surface).toBeDefined();
	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(3);
});

// effort 828, requirement 20 and criterion 20: **the account section has no link act.** A link is made
// by a holder of `inviteMember` or `resetPassword` from the account it admits into, so the section a person reads
// about themselves offers the identity, the password and the other machines, and nothing that
// hands a link over. *It offered a second-machine act until requirement 20 superseded requirement
// 3.*
test('the account section offers no link act, and nothing on it hands a link over', () => {
	at('?section=account');
	area({ section: 'account' });

	expect(document.querySelector('[data-identity]')).not.toBeNull();
	expect(document.querySelector('[data-password]')).not.toBeNull();
	expect(document.querySelector('[data-machines]')).not.toBeNull();

	expect(document.querySelector('[data-another-machine]')).toBeNull();
	expect(document.querySelector('[data-another-machine-open]')).toBeNull();
	expect(document.querySelector('[data-link-handover]')).toBeNull();
	expect(document.querySelector('[data-invited-link]')).toBeNull();
	expect(document.querySelector('[data-invited-code]')).toBeNull();
});

// effort 828, requirement 22 and criterion 22: **the acceptance is drawn for the one person an
// offer stands with**, under its own legend, as one sentence naming who offered it and one act.
// Everybody else meets an account section with nothing about ownership on it at all.
test('the account section draws the offer and its acceptance for the member it stands with', async () => {
	at('?section=account');
	area({
		section: 'account',
		session: fakeOrganizationSession({
			role: 'member',
			permissions: 0,
			ownershipOffered: true,
			ownerUsername: 'olivia.owner'
		})
	});

	const block = document.querySelector('[data-ownership-offer]');

	expect(block).not.toBeNull();
	expect(block?.textContent).toContain('olivia.owner');
	expect(block?.textContent).toContain('accepting makes you the owner');

	// and it opens the section: it is the one block here waiting on a reply, and everything under
	// it is a fact about this account that reads the same tomorrow.
	expect(
		orderOf(
			'data-ownership-offer',
			'data-identity',
			'data-password',
			'data-machines',
			'data-sign-out'
		)
	).toEqual(['data-ownership-offer', 'data-identity', 'data-password', 'data-machines']);

	// nothing about a password is drawn until the act is pressed, the way the change-password row
	// beside it works (requirement 8).
	expect(document.querySelector('[data-accept-ownership-form]')).toBeNull();

	await fireEvent.click(screen.getByText(en.organization.dashboard.acceptOwnership));

	const form = document.querySelector('[data-accept-ownership-form]');

	expect(form).not.toBeNull();
	expect(form?.querySelector('input[type=password]')).not.toBeNull();
	// effort 851, criterion 19: the password carries the eye.
	await expectTheEye(
		document.querySelector<HTMLInputElement>('#accept-ownership-password'),
		strings.showPassword
	);
	expect(document.querySelector('[data-accept-ownership-authority]')?.textContent?.trim()).toBe(
		en.organization.dashboard.acceptOwnershipAuthority
	);

	// heavy, like the offer it answers: what a person has to read before they type is the whole of
	// what changes ([[rules/interface]], *Form surface*).
	const panel = document.querySelector('[data-slot=form-surface]');

	expect(panel?.className).toContain('h-full');
	expect(panel?.className).not.toContain('rounded-3xl');
});

// and a member nobody offered it to meets none of it, which is every member on every other day.
test('the account section draws no ownership block where no offer stands', () => {
	at('?section=account');
	area({
		section: 'account',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 })
	});

	expect(document.querySelector('[data-ownership-offer]')).toBeNull();
	expect(document.querySelector('[data-accept-ownership-open]')).toBeNull();
});

/**
 * the section's cards and directories, in the order the document holds them, each named by the
 * mark its block carries.
 */
const SECTION_MARKS = [
	'data-general',
	'data-updates',
	'data-diagnostics',
	'data-identity',
	'data-password',
	'data-machines',
	'data-organization-name',
	'data-standing-block',
	'data-organization-mark',
	'data-roles',
	'data-members',
	'data-links',
	'data-leaving',
	'data-workspaces'
];

const laidOut = () => {
	const grids = [...document.querySelectorAll<HTMLElement>('[data-settings-grid]')];

	expect(grids).toHaveLength(1);

	// every card and directory the section draws, each the grid's item: a card is a settings group,
	// a directory is not boxed and stands in a wrapper of its own.
	const items = [
		...grids[0].querySelectorAll<HTMLElement>('[data-settings-group], [data-settings-directory]')
	].filter((item) => item.parentElement?.closest('[data-settings-group]') === null);

	expect(items.length).toBeGreaterThan(0);

	// one column: the column is a flex column with no grid and no width that widens it into two,
	// and nothing in it spans or is told how wide to be.
	const column = grids[0];

	expect(column.classList).toContain('flex-col');
	expect(column.className).not.toMatch(/grid-cols|@container|@min-|(^|\s)(sm|md|lg|xl):/);

	for (const item of items) {
		expect(item.className).not.toMatch(/col-span/);
		expect(item.dataset.span).toBeUndefined();
	}

	return items.map((item) =>
		SECTION_MARKS.find(
			(mark) =>
				item.hasAttribute(mark) ||
				item.closest(`[${mark}]`) !== null ||
				item.querySelector(`[${mark}]`) !== null
		)
	);
};

// effort 846, criterion 1 as revised on 2026-10-02 and ticket 31 ("each card is under the next
// card"): each section's cards stand one under the next in a single column, at every width, in
// source order, and the cards that end something last.
test('each section is one column of cards in source order, the ends last', () => {
	at('?section=general');
	const general = area({ section: 'general' });

	expect(laidOut()).toEqual(['data-general', 'data-updates', 'data-diagnostics']);
	general.unmount();

	at('?section=account');
	hostAnswers.machines = [
		{
			id: 'machine-here',
			name: 'Desk',
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: true,
			mayEndAlone: false
		}
	];
	const account = area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	expect(laidOut()).toEqual(['data-identity', 'data-password', 'data-machines']);

	// the offer is a notice in the column, first, ahead of every card.
	const offer = document.querySelector<HTMLElement>('[data-ownership-offer]')!;

	expect(offer.closest('[data-settings-grid]')).not.toBeNull();
	expect(offer.className).not.toMatch(/col-span/);
	expect(orderOf('data-ownership-offer', 'data-identity')[0]).toBe('data-ownership-offer');
	account.unmount();

	at('?section=organization');
	const organization = area({ section: 'organization' });

	// the Turso account is a row of leaving, not a card of its own (ticket 38); the links waiting to
	// be opened stand under the people they are for (effort 851).
	expect(laidOut()).toEqual([
		'data-organization-name',
		'data-standing-block',
		'data-organization-mark',
		'data-roles',
		'data-members',
		'data-links',
		'data-leaving'
	]);
	organization.unmount();

	// a member meets no Turso account.
	at('?section=organization');
	const member = area({
		section: 'organization',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 }),
		holdsTursoAuthority: false
	});

	expect(laidOut()).toEqual([
		'data-organization-name',
		'data-standing-block',
		'data-organization-mark',
		'data-roles',
		'data-leaving'
	]);
	member.unmount();

	at('?section=workspaces');
	area({ section: 'workspaces' });

	expect(laidOut()).toEqual(['data-workspaces']);
});

// effort 846, *Everything in a tab is a card*: every card holds its header inside it, its title and
// its one line, and the directories are not boxed in a card of their own.
test('every card holds its title and its line, and no directory is boxed', () => {
	for (const section of ['general', 'account', 'organization', 'workspaces'] as const) {
		at(`?section=${section}`);
		const drawn = area({ section });

		for (const group of groups()) {
			const header = group.querySelector(':scope > [data-settings-group-header]');

			expect(header?.querySelector('h2')?.textContent?.trim(), section).toBeTruthy();
			expect(
				header?.querySelector('[data-settings-group-description]')?.textContent?.trim(),
				section
			).toBeTruthy();
		}

		for (const directory of document.querySelectorAll('[data-settings-directory]')) {
			expect(directory.closest('[data-settings-group]')).toBeNull();
			expect(directory.querySelector('[data-settings-group]')).toBeNull();
			expect(directory.querySelector('[data-directory-glyph] svg')).not.toBeNull();
		}

		drawn.unmount();
	}
});

/** the rows that fold their detail under them, by name, in the order drawn. */
const foldingRows = () =>
	[...document.querySelectorAll<HTMLElement>('[data-row-details]')].map((row) => rowName(row));

/** whether an element sits inside a region a disclosure has closed, or would close. */
const folded = (element: Element) =>
	element.closest('[data-row-details-content], [data-slot=collapsible-content]') !== null;

// effort 846, *Detail that few readers need folds under its row*: exactly three rows fold, the
// available version's notes, the sync state's machine detail and the Turso connection's names,
// each closed until asked. The log folder's path folded too until ticket 31.
test('the three rows the rule names fold their detail, and no other row does', async () => {
	updater.next = {
		currentVersion: '0.14.0',
		version: '0.15.0',
		date: '2026-10-01T00:00:00Z',
		body: 'cards in a grid.',
		rawJson: {},
		downloadAndInstall: async () => {},
		close: async () => {}
	};

	at('?section=general');
	const general = area({ section: 'general' });

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.checkForUpdates }));
	await expect.poll(() => foldingRows()).toHaveLength(1);

	const fromGeneral = foldingRows();

	// the header says where the installation stands, in words.
	expect(document.querySelector('[data-updates-state]')?.textContent?.trim()).toBe(
		en.settings.updatesState.available
	);
	general.unmount();

	at('?section=account');
	hostAnswers.machines = [
		{
			id: 'machine-laptop',
			name: 'Laptop',
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: false,
			mayEndAlone: true
		}
	];
	const account = area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});
	const fromAccount = foldingRows();

	account.unmount();

	at('?section=organization');
	const organization = area({
		section: 'organization',
		syncState: fakeSyncState({ lastReachedAt: Date.now() - 60_000 })
	});
	const fromOrganization = foldingRows();

	for (const chevron of document.querySelectorAll('[data-row-details-trigger]')) {
		expect(chevron.getAttribute('aria-expanded')).toBe('false');
		expect(chevron.getAttribute('aria-label')).toBeTruthy();
	}

	organization.unmount();

	at('?section=workspaces');
	area({ section: 'workspaces' });
	const fromWorkspaces = foldingRows();

	expect([...fromGeneral, ...fromAccount, ...fromOrganization, ...fromWorkspaces]).toEqual([
		en.common.labels.availableVersion,
		en.organization.standing.state.upToDate,
		en.organization.dashboard.authorityTitle
	]);
});

// and what never folds: the sync state's word, a problem's callout, the machines list, the offer,
// and every act that ends something, each outside any collapsed region.
test('the state, a problem, the machines, the offer and every end act stand outside any fold', () => {
	at('?section=organization');
	const organization = area({
		section: 'organization',
		syncState: fakeSyncState({ accountRefusal: { since: 1 }, lastReachedAt: Date.now() })
	});

	const state = document.querySelector('[data-standing]')!;

	expect(folded(state.querySelector('[data-slot=item-title]')!)).toBe(false);
	expect(folded(state.querySelector('[data-last-reached]')!)).toBe(false);
	expect(folded(document.querySelector('[data-account-refusal]')!)).toBe(false);

	const ends = [...document.querySelectorAll('[data-row-tone=error]')];

	expect(ends.length).toBeGreaterThan(0);
	expect(ends.filter(folded)).toEqual([]);
	expect(ends.filter((row) => row.hasAttribute('data-row-details'))).toEqual([]);
	organization.unmount();

	at('?section=account');
	hostAnswers.machines = [
		{
			id: 'machine-here',
			name: 'Desk',
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: true,
			mayEndAlone: false
		},
		{
			id: 'machine-laptop',
			name: 'Laptop',
			seenAt: Date.now(),
			createdAt: Date.now(),
			isThisMachine: false,
			mayEndAlone: true
		}
	];
	area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	const machineRows = [...document.querySelectorAll('[data-machines] [data-settings-row]')];

	expect(machineRows.length).toBe(2);
	expect(machineRows.filter(folded)).toEqual([]);
	expect(folded(document.querySelector('[data-ownership-offer]')!)).toBe(false);
	expect([...document.querySelectorAll('[data-row-tone=error]')].filter(folded)).toEqual([]);
	expect(document.querySelectorAll('[data-row-details]')).toHaveLength(0);
});

/** a tooltip's words once its trigger has the focus: the content is drawn only while it is open. */
const hintOf = async (trigger: HTMLElement, mark: string) => {
	await fireEvent.focus(trigger);

	return waitFor(() => {
		const hint = document.querySelector<HTMLElement>(`[${mark}]`);

		expect(hint).not.toBeNull();

		return hint!.textContent?.trim();
	});
};

// effort 846 ticket 31, at the human's word of 2026-10-02 ("only the action button shoud be in
// red"): in every row that ends something, in every tab, the glyph and the name are neutral and
// the act's button is the one thing in the error tone.
test("in every ending row of the area, only the act's button is red", () => {
	const ends: HTMLElement[] = [];

	for (const section of ['general', 'account', 'organization', 'workspaces'] as const) {
		at(`?section=${section}`);
		hostAnswers.machines = [
			{
				id: 'machine-here',
				name: 'Desk',
				seenAt: Date.now(),
				createdAt: Date.now(),
				isThisMachine: true,
				mayEndAlone: false
			},
			{
				id: 'machine-laptop',
				name: 'Laptop',
				seenAt: Date.now(),
				createdAt: Date.now(),
				isThisMachine: false,
				mayEndAlone: true
			}
		];
		const drawn = area({ section });

		for (const row of document.querySelectorAll<HTMLElement>('[data-row-tone=error]')) {
			const glyph = row.querySelector('[data-slot=item-media]')!;
			const name = row.querySelector('[data-slot=item-title]')!;
			const red = [...row.querySelectorAll<HTMLElement>('[class*=text-destructive]')];

			expect(glyph.className, rowName(row)).not.toMatch(/destructive/);
			expect(name.className, rowName(row)).not.toMatch(/destructive/);
			expect(name.querySelector('[class*=destructive]'), rowName(row)).toBeNull();
			expect(red.length, rowName(row)).toBe(1);
			expect(red[0].tagName, rowName(row)).toBe('BUTTON');
			ends.push(row);
		}

		drawn.unmount();
	}

	// the organization's ends. The account has none since ticket 46: this machine signs out from
	// its row's menu and every other one from the machines card's header.
	expect(ends.map(rowName)).toEqual(
		expect.arrayContaining([en.organization.dashboard.forgetAccount])
	);
	expect(ends.map(rowName)).not.toContain(en.settings.you.sessions.action);
	expect(ends.map(rowName)).not.toContain(en.settings.you.thisMachine.signOut);
	expect(ends.length).toBeGreaterThanOrEqual(2);
});

// effort 846 ticket 31 ("whey there's a collapsoable on the diangostics"; "the open log oflder
// should be just hte icon"): the diagnostics card folds nothing, its whole path is the folder's
// meta line, and the reveal is an icon control named, and hinted, open log folder.
test('diagnostics folds nothing, shows the whole path, and reveals by an icon named for it', async () => {
	at('?section=general');
	area({ section: 'general' });

	const card = document.querySelector<HTMLElement>('[data-diagnostics] [data-settings-group]')!;

	expect(card.querySelector('[data-row-details], [data-slot=collapsible-content]')).toBeNull();
	expect(card.querySelector('[data-row-details-trigger]')).toBeNull();
	expect(card.querySelector('[data-row-meta] [data-diagnostics-path]')?.textContent?.trim()).toBe(
		fakeSettings().diagnosticsDir
	);

	const reveal = within(card).getByRole('button', { name: en.settings.diagnosticsReveal });

	expect(reveal.hasAttribute('data-diagnostics-reveal')).toBe(true);
	// the glyph alone on screen; its words are its name and its tooltip.
	expect(reveal.querySelector('svg')).not.toBeNull();
	expect(reveal.textContent?.trim()).toBe('');
	expect(await hintOf(reveal, 'data-diagnostics-reveal-hint')).toBe(en.settings.diagnosticsReveal);
});

// effort 846 ticket 31 ("on the appearnce the explaintion on the button feels ood"): no sentence
// explains language or appearance, and system, the one choice whose word does not say what it
// does, says what it follows in its tooltip, in both locales.
test('language and appearance carry no explanation, and system says what it follows in a tooltip', async () => {
	at('?section=general');
	area({ section: 'general' });

	const card = document.querySelector<HTMLElement>('[data-general] [data-settings-group]')!;

	expect(card.querySelector('[data-settings-group-footer]')).toBeNull();
	expect(card.querySelectorAll('[data-row-meta], [data-row-beneath]')).toHaveLength(0);
	// the header's one line is the card's, saying what it is for; nothing explains a choice.
	expect(card.querySelectorAll('p')).toHaveLength(1);

	const system = card.querySelector<HTMLElement>('[data-appearance=system]')!;

	// still a segment of the choice, pressed as the stored setting says.
	expect(system.getAttribute('data-state')).toBe(
		fakeSettings().appearance === 'system' ? 'on' : 'off'
	);
	expect(await hintOf(system, 'data-appearance-hint')).toBe(en.settings.appearanceSystemHint);
	expect(document.querySelectorAll('[data-appearance-hint]')).toHaveLength(1);

	await fireEvent.blur(system);
	loadLocale('ar');
	setLocale('ar');
	await tick();

	expect(await hintOf(system, 'data-appearance-hint')).toBe(ar.settings.appearanceSystemHint);
	loadLocale('en');
	setLocale('en');
});

// effort 846 ticket 31, the human's addition ("the check for updates button needs to be just hte
// icon and the unkown needs to be not their in the update version"): the check is an icon control
// named by its tooltip, and the available version shows nothing until a check finds one.
test('updates checks by an icon named for it, and shows no available version until there is one', async () => {
	updater.next = {
		currentVersion: '0.14.0',
		version: '0.15.0',
		date: '2026-10-01T00:00:00Z',
		body: null,
		rawJson: {},
		downloadAndInstall: async () => {},
		close: async () => {}
	};

	at('?section=general');
	area({ section: 'general' });

	// the row is drawn again once it has a release's notes to fold, so it is found afresh.
	const availableRow = () =>
		generalRows().find((row) => rowName(row) === en.common.labels.availableVersion)!;
	const available = availableRow();

	expect(available.querySelector('[data-row-value]')).toBeNull();
	expect(available.textContent).not.toContain(en.common.messages.unknown);

	const check = within(available).getByRole('button', { name: en.common.actions.checkForUpdates });

	expect(check.hasAttribute('data-check-for-updates')).toBe(true);
	expect(check.querySelector('svg')).not.toBeNull();
	expect(check.textContent?.trim()).toBe('');
	expect(await hintOf(check, 'data-check-for-updates-hint')).toBe(
		en.common.actions.checkForUpdates
	);

	await fireEvent.click(check);
	await expect
		.poll(() => availableRow().querySelector('[data-row-value]')?.textContent?.trim())
		.toBe('0.15.0');
});

/** the lucide names of the glyphs drawn inside an element, `refresh-cw` for `lucide-refresh-cw`. */
const glyphNamesIn = (element: Element | null) =>
	[...(element?.querySelectorAll('svg') ?? [])].flatMap((svg) =>
		[...svg.classList]
			.filter((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
			.map((name) => name.replace('lucide-', ''))
	);

// effort 846 ticket 38, at the human's word of 2026-10-02 ("i find it odd using the same icon of
// the sectio ntitle and descripto in the action button"): in every tab, for every card and every
// directory heading, owner and member, the Turso authority held and not, no button carries the
// glyph its card leads with, and no button on a row carries the glyph its row leads with.
test("no button in the area repeats its row's or its card's glyph", () => {
	const walked = { cards: 0, buttons: 0 };

	const sessions = [
		fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' }),
		fakeOrganizationSession({ role: 'member', permissions: 0 })
	];

	for (const session of sessions) {
		for (const holdsTursoAuthority of [true, false]) {
			for (const section of ['general', 'account', 'organization', 'workspaces'] as const) {
				at(`?section=${section}`);
				hostAnswers.machines = [
					{
						id: 'machine-here',
						name: 'Desk',
						seenAt: Date.now(),
						createdAt: Date.now(),
						isThisMachine: true,
						mayEndAlone: false
					},
					{
						id: 'machine-laptop',
						name: 'Laptop',
						seenAt: Date.now(),
						createdAt: Date.now(),
						isThisMachine: false,
						mayEndAlone: true
					}
				];
				const drawn = area({
					section,
					session,
					holdsTursoAuthority,
					syncState: fakeSyncState({ lastReachedAt: Date.now() - 60_000 }),
					...OWNER_AND_ADA
				});

				const cards: { card: Element; glyph: string[]; buttons: Element[] }[] = [
					...[...document.querySelectorAll('[data-settings-group]')].map((card) => ({
						card,
						glyph: glyphNamesIn(card.querySelector('[data-settings-group-glyph]')),
						buttons: [...card.querySelectorAll('button')]
					})),
					// a directory's heading is a card's header, and its tray is what it acts with.
					...[...document.querySelectorAll('[data-directory-tray]')].map((card) => ({
						card,
						glyph: glyphNamesIn(card.querySelector('[data-directory-glyph]')),
						buttons: [...card.querySelectorAll('button')]
					})),
					// the ownership offer, a notice that leads with its own glyph.
					...[...document.querySelectorAll('[data-ownership-offer]')].map((card) => ({
						card,
						glyph: glyphNamesIn(card.querySelector('[data-slot=callout] > svg')),
						buttons: [...card.querySelectorAll('button')]
					}))
				];

				for (const { card, glyph, buttons } of cards) {
					walked.cards += 1;

					for (const button of buttons) {
						const row = button.closest('[data-settings-row]');
						const rowGlyph = row
							? glyphNamesIn(row.querySelector(':scope > [data-slot=item-media]'))
							: [];
						const own = glyphNamesIn(button);
						const where = `${section}: ${card.querySelector('h2, legend')?.textContent?.trim() ?? 'notice'} / ${button.getAttribute('aria-label') ?? button.textContent?.trim()}`;

						walked.buttons += 1;

						for (const name of own) {
							expect(glyph, where).not.toContain(name);
							expect(rowGlyph, where).not.toContain(name);
						}
					}
				}

				drawn.unmount();
			}
		}
	}

	// the walk met the cards it is about, rather than passing on an empty page.
	expect(walked.cards).toBeGreaterThan(20);
	expect(walked.buttons).toBeGreaterThan(20);
});
