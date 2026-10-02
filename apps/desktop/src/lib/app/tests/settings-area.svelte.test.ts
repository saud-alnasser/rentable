import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { sectionsOn } from '$lib/app/surfaces';
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
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';
import SettingsArea from '$lib/settings/component/area.svelte';
import { SECTION_GLYPH } from '$lib/settings/glyph';
import settingsSurface from '$lib/settings/surface';
import type { AddressableSection } from '$lib/settings/section';
import Providers from '#tests/providers.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { pressSearchKey } from '$lib/list/tests/search';
import { BUILT_IN } from '@rentable/workspace-permission';
import { listenForSignOut } from '$lib/sync';

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

const { address } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings') }
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

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).syncHooks
}));

beforeEach(resetHostAnswers);

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

/** a settings row's name, as its title draws it. */
const rowName = (row: Element) => row.querySelector('[data-slot=item-title]')?.textContent?.trim();

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

	expect(screen.getByText(en.settings.preferencesFooter)).toBeDefined();
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

	// updates' check and diagnostics' reveal are labelled buttons with their glyph.
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
	// in as them, then the way out of this one (effort 846, requirement 8). No offer stands
	// here, so the section opens with the identity.
	expect(
		orderOf(
			'data-ownership-offer',
			'data-identity',
			'data-password',
			'data-machines',
			'data-sign-out'
		)
	).toEqual(['data-identity', 'data-password', 'data-machines', 'data-sign-out']);

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

// how this machine stands to the organization, then the account the databases sit on, then the
// people, then the two acts that end something, the heavier of them last. Settled by the human on
// the real organization.
test('the organization section is ordered: standing, account, people, leaving', () => {
	at('?section=organization');
	area({ section: 'organization' });

	expect(
		orderOf(
			'data-standing-block',
			'data-turso-account',
			'data-members',
			'data-leaving',
			'data-disconnect',
			'data-delete-organization'
		)
	).toEqual([
		'data-standing-block',
		'data-turso-account',
		'data-members',
		'data-leaving',
		'data-disconnect',
		'data-delete-organization'
	]);

	// the acts at the foot stand under one title, so a reader knows what the last group is before
	// reading any of its lines.
	const leaving = document.querySelector('[data-leaving]')!;

	expect(leaving.querySelector('[data-settings-group] h2')?.textContent?.trim()).toBe(
		en.organization.dashboard.leavingTitle
	);
	expect(leaving.querySelector('[data-disconnect]')).not.toBeNull();
	expect(leaving.querySelector('[data-delete-organization]')).not.toBeNull();
});

// criterion 12 of effort 846, from the area's side: the section opens with the sync group, a
// settings group whose one row names the state and says when this machine last reached Turso,
// with the control named "sync". Each state is read in
// `organization/tests/standing.svelte.test.ts`; what is read here is that the section draws that
// group, first, with the moment the machine holds.
test('the organization section opens with the sync group: the state, the last reach, and sync', () => {
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
	expect(block.querySelector('[data-standing-word]')?.textContent?.trim()).toBe(
		en.organization.standing.state.upToDate
	);
	expect(block.querySelector('[data-last-reached]')?.textContent?.trim()).toBe(
		en.organization.standing.lastReachedRecently.replace('{moment:string}', '2 minutes ago')
	);
	expect(block.querySelector('[data-check-now]')?.textContent?.trim()).toBe(
		en.organization.standing.checkNow
	);
	expect(block.querySelector('[data-slot="badge"]')).toBeNull();
	// and it is the first block of the section.
	expect(
		orderOf('data-standing-block', 'data-turso-account', 'data-members', 'data-leaving')[0]
	).toBe('data-standing-block');
});

// an owner whose machine holds no authority meets the reconnect where the account block is, and
// no delete: the act needs the authority that block is about, which is the gate it had while it
// sat inside it.
test('an owner holding no authority meets the reconnect, and the foot is the disconnect alone', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(
		orderOf('data-standing-block', 'data-turso-account', 'data-members', 'data-disconnect')
	).toEqual(['data-standing-block', 'data-turso-account', 'data-members', 'data-disconnect']);
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
// machines signed in as the reader, and offers signing every other one out at the group's foot,
// behind one confirm. What the rows hold and ask is `organization/session/tests/machines.svelte.test.ts`'s;
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

	await fireEvent.click(machines.querySelector('[data-end-machine=machine-laptop]')!);

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

// effort 846, criterion 8 for the account section: the groups stand in the order requirement 8
// gives, and the last one is signing out of this machine, alone, in the error tone, with its glyph.
test('the account section ends with signing out of this machine, in the error tone', () => {
	at('?section=account');
	area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	const last = groups().at(-1)!;
	const rows = [...last.querySelectorAll<HTMLElement>('[data-settings-row]')];

	expect(groups()).toHaveLength(5);
	expect(last.closest('[data-sign-out]')).not.toBeNull();
	expect(rows.map(rowName)).toEqual([en.settings.you.thisMachine.signOut]);
	expect(rows[0].dataset.rowTone).toBe('error');
	expect(rows[0].querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(last.textContent).toContain(en.settings.you.thisMachine.description);
});

// requirement 2: signing this machine out is undone by signing in, so it asks nothing first and
// goes straight to the shell, the way the rail's menu does.
test('signing out of this machine asks the shell at once, with no confirmation', async () => {
	at('?section=account');
	area({ section: 'account' });

	let asked = 0;
	const stop = listenForSignOut(() => {
		asked += 1;
	});

	await fireEvent.click(screen.getByRole('button', { name: en.settings.you.thisMachine.signOut }));
	stop();

	expect(asked).toBe(1);
	expect(screen.queryByRole('alertdialog')).toBeNull();
	expect(screen.queryByRole('dialog')).toBeNull();
});

// requirements 1, 2 and 5, criteria 1, 2 and 5 for the account section, with an offer standing so
// every group is drawn: every row leads with a glyph and has a name; within a group the buttons
// all carry a glyph or none does; the error tone is only on a row that is the last of its group.
test('every account row has a glyph and a name, and the buttons of a group agree on glyphs', () => {
	at('?section=account');
	area({
		section: 'account',
		session: fakeOrganizationSession({ ownershipOffered: true, ownerUsername: 'olivia.owner' })
	});

	const rows = [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];

	expect(rows.length).toBeGreaterThanOrEqual(5);

	for (const row of rows) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
		expect(rowName(row)).toBeTruthy();
	}

	for (const group of groups()) {
		const buttons = [...group.querySelectorAll('button')];
		const withGlyph = buttons.filter((button) => button.querySelector('svg') !== null);

		expect([0, buttons.length]).toContain(withGlyph.length);

		const inGroup = [...group.querySelectorAll<HTMLElement>('[data-settings-row]')];

		inGroup.forEach((row, index) => {
			if (row.dataset.rowTone === 'error') expect(index).toBe(inGroup.length - 1);
		});
	}

	expect(rows.filter((row) => row.dataset.rowTone === 'error').map(rowName)).toEqual([
		en.settings.you.sessions.action,
		en.settings.you.thisMachine.signOut
	]);
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

/** the Turso account group's rows, in order. */
const tursoRows = () => [
	...document.querySelectorAll<HTMLElement>('[data-turso-account] [data-settings-row]')
];

// effort 846, criterion 13 with 2 and 5, from the area's side: the owner whose machine holds the
// authority meets the Turso account as a connected row, and forgetting it as the group's last row,
// in the error tone, with its glyph, asked first with the sentence naming where to revoke the token.
test('an owner holding the authority reads the turso account as connected, and forget last', async () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: true });

	const [account, forget] = tursoRows();

	expect(tursoRows().map(rowName)).toEqual([
		en.organization.dashboard.authorityTitle,
		en.organization.dashboard.forgetAccount
	]);
	expect(account.querySelector('[data-row-value]')?.textContent?.trim()).toBe(
		en.organization.dashboard.authorityConnected
	);
	expect(account.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(forget.dataset.rowTone).toBe('error');
	expect(forget.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(forget.querySelector('button svg')).not.toBeNull();

	await fireEvent.click(forget.querySelector('[data-forget-account-open]')!);

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokes);
	expect(dialog.textContent).toContain(en.organization.dashboard.forgetAccountRevokesAt);
});

// and the owner whose machine does not: the row reads not held here and carries the reconnect,
// with its glyph, and nothing in the group is drawn in the error tone, since nothing is held to end.
test('an owner holding no authority reads the turso account as not held, with an icon on reconnect', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	const [account] = tursoRows();

	expect(tursoRows()).toHaveLength(1);
	expect(rowName(account)).toBe(en.organization.dashboard.authorityTitle);
	expect(account.querySelector('[data-row-value]')?.textContent?.trim()).toBe(
		en.organization.dashboard.authorityNotHeld
	);
	expect(account.querySelector('[data-reconnect-authority-open] svg')).not.toBeNull();
	expect(document.querySelector('[data-turso-account] [data-row-tone=error]')).toBeNull();
});

// effort 846, criterion 5 for the two groups this ticket draws: within each, every button carries
// a glyph or none does, held or not, and the mark's group with them.
test('the turso and mark groups agree on glyphs within each group', () => {
	for (const holdsTursoAuthority of [true, false]) {
		at('?section=organization');
		const { unmount } = area({ section: 'organization', holdsTursoAuthority });

		const ours = groups().filter(
			(group) =>
				group.closest('[data-turso-account]') !== null ||
				group.closest('[data-organization-mark]') !== null
		);

		expect(ours).toHaveLength(2);

		for (const group of ours) {
			const buttons = [...group.querySelectorAll('button')];
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
		{ memberId: 'member-owner', passwordSet: true, machineSignedIn: true },
		{ memberId: 'ada', passwordSet: true, machineSignedIn: false }
	]
};

// effort 846, criterion 14 with 2: a member's leaving group holds disconnect this machine alone,
// with its glyph and the line saying the organization stays on Turso and a link brings them back.
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
		expect(rows[0].querySelector('button svg')).not.toBeNull();
		expect(rows[0].querySelector('[data-leaving-consequence]')?.textContent?.trim()).toBe(
			en.organization.dashboard.disconnectComesBack
		);
		expect(document.querySelector('[data-leaving] [data-act]')).toBeNull();

		unmount();
	}
});

// and an owner's holds the handover first, then the disconnect, then the delete, the two that end
// something as the group's error rows after its separator, the delete last and saying nothing
// undoes it. No two of the three share a glyph or a line.
test('an owner leaves by the handover, then the disconnect, then the delete, last', () => {
	at('?section=organization');
	area({ section: 'organization', ...OWNER_AND_ADA });

	const rows = leavingRows();

	expect(rows.map(rowName)).toEqual([
		en.organization.dashboard.transferOwnership,
		en.organization.dashboard.disconnectThisMachine,
		en.organization.dashboard.deleteOrganization
	]);
	expect(rows.map((row) => row.dataset.rowTone)).toEqual(['neutral', 'error', 'error']);

	// the two error rows are the group's end, after its separator.
	const group = document.querySelector<HTMLElement>('[data-leaving] [data-settings-group]')!;
	const separator = group.querySelector('[data-slot=item-separator]')!;

	expect(
		separator.compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(
		rows[0].compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();

	const lines = rows.map((row) =>
		row.querySelector('[data-leaving-consequence]')?.textContent?.trim()
	);

	expect(lines).toEqual([
		en.organization.dashboard.handOverGoes,
		en.organization.dashboard.disconnectForgets,
		en.organization.dashboard.deleteOrganizationDescription
	]);
	expect(lines[2]).toContain('nothing puts them back');

	const glyphs = rows.map((row) => row.querySelector('[data-slot=item-media] svg')?.outerHTML);

	expect(glyphs.every((glyph) => glyph !== undefined)).toBe(true);
	expect(new Set(glyphs).size).toBe(3);
	expect(rows.every((row) => row.querySelector('button svg') !== null)).toBe(true);
});

// the handover is the owner's card's own act, run through the member host on the owner's own
// record, and what it opens is the offer form the card already opens.
test('pressing the handover runs the card act through the member host and opens the offer', async () => {
	const run = vi.spyOn(memberHost, 'run');

	at('?section=organization');
	render(OrganizationHost, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });
	area({ section: 'organization', ...OWNER_AND_ADA });

	const handover = leavingRows()[0].querySelector<HTMLButtonElement>(
		'[data-act="member.offerOwnership"]'
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
			{ memberId: 'member-owner', passwordSet: true, machineSignedIn: true },
			{ memberId: 'ada', passwordSet: false, machineSignedIn: false }
		]
	});

	const handover = leavingRows()[0].querySelector<HTMLButtonElement>(
		'[data-act="member.offerOwnership"]'
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

	const [first] = leavingRows();

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
// the workspaces section draws, and the transfer beneath it. What each row offers is read in
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
	).toEqual([
		'data-ownership-offer',
		'data-identity',
		'data-password',
		'data-machines',
		'data-sign-out'
	]);

	// nothing about a password is drawn until the act is pressed, the way the change-password row
	// beside it works (requirement 8).
	expect(document.querySelector('[data-accept-ownership-form]')).toBeNull();

	await fireEvent.click(screen.getByText(en.organization.dashboard.acceptOwnership));

	const form = document.querySelector('[data-accept-ownership-form]');

	expect(form).not.toBeNull();
	expect(form?.querySelector('input[type=password]')).not.toBeNull();
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
