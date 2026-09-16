import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import {
	fakeOrganizationSession,
	fakeSettings,
	fakeSyncState
} from '$lib/platform/tests/testing.ts';
import SettingsArea from '$lib/settings/component/area.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { maskOf, EVERY_ADMINISTRATION } from '@rentable/workspace-permission';

import Providers from './providers.svelte';

/**
 * THE SETTINGS AREA, RENDERED
 *
 * Criterion 14 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], read where
 * it can be read: the area is pure props, so two sessions are two renders, and what each reader
 * is offered is whatever reached the rail. A route could not be asked this, since no route renders
 * under this runner, and the gating would be behind four queries.
 *
 * **The address is the mock**, because that is where a section is named. `$app/state` is
 * supplied by the SvelteKit plugin and carries no navigation here, so the one member the rail
 * reads is stood in for and moved between tests.
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

const noop = () => {};
const resolved = async () => {};

/** the reader is standing at this section of the area. */
const at = (search = '') => {
	address.url = new URL(`http://localhost/settings${search}`);
};

const area = (overrides: Partial<Parameters<typeof render<typeof SettingsArea>>[1]> = {}) => {
	loadLocale('en');
	setLocale('en');

	return render(
		SettingsArea,
		{
			section: 'general',
			settings: fakeSettings(),
			session: fakeOrganizationSession({ permissions: maskOf(...EVERY_ADMINISTRATION) }),
			holdsTursoAuthority: true,
			syncState: fakeSyncState(),
			members: [],
			standings: [],
			makingLink: null,
			unsetting: null,
			endingSessions: null,
			isChangingPassword: false,
			isChangingRole: false,
			isChangingAccess: false,
			isOffering: false,
			isWithdrawing: false,
			isAcceptingOwnership: false,
			isDeletingOrganization: false,
			onChangeLocale: noop,
			onRevealDiagnostics: noop,
			onChangePassword: resolved,
			onEndOtherSessions: resolved,
			onEndSessions: noop,
			onMakeLink: noop,
			onUnsetPassword: noop,
			onRemove: noop,
			onLockOut: noop,
			onRename: resolved,
			onChangeRole: resolved,
			onChangeAccess: resolved,
			onOfferOwnership: resolved,
			onWithdrawOffer: noop,
			onAcceptOwnership: resolved,
			onChangeWorkspaceAccess: resolved,
			onDeleteWorkspace: resolved,
			onAuthorityReconnected: noop,
			onDeleteOrganization: resolved,
			onDisconnect: resolved,
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);
};

/** the rail's anchors, in the order they were drawn. */
const tabs = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-settings-rail] a')];

const tabNames = () => tabs().map((tab) => tab.textContent?.trim());

test('an owner is offered the seven sections, in requirement 14 order', () => {
	at();
	area();

	expect(tabNames()).toEqual([
		en.settings.section.general,
		en.settings.section.you,
		en.settings.section.members,
		en.settings.section.workspaces,
		en.settings.section.sync,
		en.settings.section.updates,
		en.settings.section.diagnostics
	]);
});

// the tabs are anchors rather than a tab list, because every section is addressable: a menu row,
// the palette and a bookmark all open one by this address.
test('each tab is an anchor carrying its own section in the address', () => {
	at();
	area();

	expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
		'/settings?section=general',
		'/settings?section=you',
		'/settings?section=members',
		'/settings?section=workspaces',
		'/settings?section=sync',
		'/settings?section=updates',
		'/settings?section=diagnostics'
	]);
});

test('a plain member is offered every section but members', () => {
	at();
	area({ session: fakeOrganizationSession({ role: 'member', permissions: 0 }) });

	expect(tabNames()).toEqual([
		en.settings.section.general,
		en.settings.section.you,
		en.settings.section.workspaces,
		en.settings.section.sync,
		en.settings.section.updates,
		en.settings.section.diagnostics
	]);
	expect(tabNames()).not.toContain(en.settings.section.members);
});

// the area is the one address that draws with nobody signed in, and the three sections that
// need no organization are all it can offer there.
test('with nobody signed in, the three sections that need no session', () => {
	at();
	area({ session: null, syncState: null, holdsTursoAuthority: false });

	expect(tabNames()).toEqual([
		en.settings.section.general,
		en.settings.section.updates,
		en.settings.section.diagnostics
	]);
});

test('the section the address names is the one marked, and the only one', () => {
	at('?section=updates');
	area({ section: 'updates' });

	const marked = tabs().filter((tab) => tab.getAttribute('aria-current') === 'page');

	expect(marked).toHaveLength(1);
	expect(marked[0]?.textContent?.trim()).toBe(en.settings.section.updates);
});

test('and the body is that section rather than the first one', () => {
	at('?section=you');
	area({ section: 'you', session: fakeOrganizationSession({ username: 'ada.lovelace' }) });

	expect(screen.getByText('ada.lovelace')).toBeDefined();
	expect(screen.getByText(en.settings.you.password.title)).toBeDefined();
	expect(screen.queryByText(en.settings.localeTitle)).toBeNull();
});

// requirement 14: a section with nothing to show for this member is absent, not empty. An
// address naming one is easy to arrive at honestly, and it opens the area rather than a refusal.
test('a section this reader is not offered draws the default section, with nothing marked', () => {
	at('?section=members');
	area({
		section: 'members',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 })
	});

	expect(tabNames()).not.toContain(en.settings.section.members);
	expect(screen.getByText(en.settings.localeTitle)).toBeDefined();
	expect(
		tabs()
			.find((tab) => tab.getAttribute('aria-current') === 'page')
			?.textContent?.trim()
	).toBe(en.settings.section.general);
});

// criterion 22 of effort 826: the you section offers the reader a way to sign themselves out of
// every other machine, and asks once before it runs. The act is on the route; what is read here is
// that the control is there and that the question stands in front of it.
test('the you section offers signing out of other machines, behind one confirm', async () => {
	at('?section=you');
	area({ section: 'you' });

	const control = document.querySelector('[data-end-other-sessions-open]');

	expect(control).not.toBeNull();
	expect(screen.getByText(en.settings.you.sessions.title)).toBeDefined();
	expect(screen.getByText(en.settings.you.sessions.description)).toBeDefined();
	// nothing has been asked yet, so nothing has been confirmed.
	expect(screen.queryByText(en.settings.you.sessions.confirmDescription)).toBeNull();

	await fireEvent.click(control!);

	expect(await screen.findByText(en.settings.you.sessions.confirmDescription)).toBeDefined();
});

test('the area carries one title, and it is the area rather than the section', () => {
	at('?section=diagnostics');
	area({ section: 'diagnostics' });

	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.settings.title);
});

// criterion 14 and criterion 16, the sync section: the owner's own item is the Turso account, and
// a plain member does not meet it. The status and the disconnect are everybody's, since a member
// reads whether their machine is reaching the workspace and leaves the organization from the same
// place the owner does.
//
// **And there is no link block for anybody** (effort 828, criterion 16). The organization's own
// link stood here for the owner, named as the copy that recovered the organization when every
// machine was gone; requirement 16 retired it, because the way back is the owner's Turso account
// and their password, and nothing is minted that a found copy could read the directory with.
test('the sync section gives the owner the turso account and the disconnect, and no link', () => {
	at('?section=sync');
	area({ section: 'sync' });

	expect(screen.getByText(en.organization.dashboard.authorityTitle)).toBeDefined();
	expect(document.querySelector('[data-forget-account]')).not.toBeNull();
	expect(document.querySelector('[data-reconnect-authority]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(screen.getByText(en.workspace.syncDescription)).toBeDefined();
	expect(document.querySelector('[data-organization-link]')).toBeNull();
	expect(document.querySelector('[data-link-description]')).toBeNull();
});

// effort 828, requirement 18: the owner can end the organization from the same block the account
// is in, because it is the account the databases are on. Nobody else sees the control, and nothing
// about it is drawn until they ask: the question that follows is the shared form surface at its
// heavy weight, naming what goes and taking the password.
test('the owner is offered the delete, on a surface that says what goes and takes the password', async () => {
	at('?section=sync');
	area({ section: 'sync' });

	const control = document.querySelector('[data-delete-organization-open]');

	expect(control).not.toBeNull();
	expect(screen.getByText(en.organization.dashboard.deleteOrganizationDescription)).toBeDefined();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(0);
	expect(document.querySelector('[data-slot=form-surface]')).toBeNull();

	await fireEvent.click(control!);
	await screen.findByText(en.organization.dashboard.deleteOrganizationGoes);

	expect(document.querySelector('[data-slot=form-surface]')).not.toBeNull();
	expect(document.querySelectorAll('input[type=password]')).toHaveLength(1);
	expect(screen.getByText(en.organization.dashboard.deleteOrganizationPassword)).toBeDefined();
});

test('an administrator is offered no delete, because the block it sits in is the owners', () => {
	at('?section=sync');
	area({
		section: 'sync',
		session: fakeOrganizationSession({
			role: 'administrator',
			permissions: maskOf(...EVERY_ADMINISTRATION)
		})
	});

	expect(document.querySelector('[data-delete-organization]')).toBeNull();
	expect(document.querySelector('[data-delete-organization-open]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.authorityTitle)).toBeNull();
	// and the section is still theirs to read: the status and the disconnect are everybody's.
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
});

// requirement 5: the authority is restored from nowhere, so an owner on a machine that holds
// none is offered the consent again rather than the control that gives it back.
test('an owner whose machine holds no authority is offered the reconnect in its place', () => {
	at('?section=sync');
	area({ section: 'sync', holdsTursoAuthority: false });

	expect(document.querySelector('[data-reconnect-authority]')).not.toBeNull();
	expect(document.querySelector('[data-forget-account]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.authorityDescription)).toBeDefined();
});

// criterion 22: an owner who was handed the organization holds no authority either, and the reason
// is not that this machine lost one. The block says where the authority does belong, in one short
// sentence, and offers the same reconnect.
test('an owner holding no authority is told the authority follows the account that consented', () => {
	at('?section=sync');
	area({ section: 'sync', holdsTursoAuthority: false });

	expect(screen.getByText(en.organization.dashboard.authorityFollowsTheAccount)).toBeDefined();
	expect(document.querySelector('[data-authority-follows-the-account]')).not.toBeNull();
	// and the offer beside it is the one that already existed.
	expect(document.querySelector('[data-reconnect-authority]')).not.toBeNull();
});

// and nobody else meets it: an owner whose machine holds the authority has nothing to be told, and
// a plain member never reads this block at all.
test('the sentence is absent for an owner who holds the authority', () => {
	at('?section=sync');
	area({ section: 'sync', holdsTursoAuthority: true });

	expect(document.querySelector('[data-authority-follows-the-account]')).toBeNull();
});

test('a plain member reads the sync status and the disconnect, and nothing of the account', () => {
	at('?section=sync');
	area({
		section: 'sync',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 }),
		holdsTursoAuthority: false
	});

	expect(screen.getByText(en.workspace.syncDescription)).toBeDefined();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(document.querySelector('[data-forget-account]')).toBeNull();
	expect(document.querySelector('[data-reconnect-authority]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.authorityTitle)).toBeNull();
	expect(document.querySelector('[data-organization-link]')).toBeNull();
});

// criterion 16 from the area's side: the section is the list this member holds, with the rows
// the workspaces section draws. What each row offers is read in `workspaces.svelte.test.ts`.
test('the workspaces section draws a row per workspace the session holds', () => {
	at('?section=workspaces');
	area({ section: 'workspaces' });

	expect(document.querySelectorAll('[data-workspace]')).toHaveLength(1);
	expect(document.querySelector('[data-workspace-name]')?.textContent?.trim()).toBe(
		'North Properties'
	);
});

// effort 828, requirement 8: nothing about the password is on screen until the person asks to
// change it. The form was three empty fields drawn under a heading on every visit until then, and
// a write drawn inline is off the one rule every other write here follows.
test('the you section states the password and draws no field until the change control is pressed', async () => {
	at('?section=you');
	area({ section: 'you' });

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

// effort 828, requirement 20 and criterion 20: **the you section has no link act.** A link is made
// by the owner or an administrator from the account it admits into, so the section a person reads
// about themselves offers the identity, the password and the other machines, and nothing that
// hands a link over. *It offered a second-machine act until requirement 20 superseded requirement
// 3.*
test('the you section offers no link act, and nothing on it hands a link over', () => {
	at('?section=you');
	area({ section: 'you' });

	expect(document.querySelector('[data-identity]')).not.toBeNull();
	expect(document.querySelector('[data-password]')).not.toBeNull();
	expect(document.querySelector('[data-end-other-sessions]')).not.toBeNull();

	expect(document.querySelector('[data-another-machine]')).toBeNull();
	expect(document.querySelector('[data-another-machine-open]')).toBeNull();
	expect(document.querySelector('[data-link-handover]')).toBeNull();
	expect(document.querySelector('[data-invited-link]')).toBeNull();
	expect(document.querySelector('[data-invited-code]')).toBeNull();
});

// effort 828, requirement 22 and criterion 22: **the acceptance is drawn for the one person an
// offer stands with**, under its own legend, as one sentence naming who offered it and one act.
// Everybody else meets a you section with nothing about ownership on it at all.
test('the you section draws the offer and its acceptance for the member it stands with', async () => {
	at('?section=you');
	area({
		section: 'you',
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
test('the you section draws no ownership block where no offer stands', () => {
	at('?section=you');
	area({
		section: 'you',
		session: fakeOrganizationSession({ role: 'member', permissions: 0 })
	});

	expect(document.querySelector('[data-ownership-offer]')).toBeNull();
	expect(document.querySelector('[data-accept-ownership-open]')).toBeNull();
});
