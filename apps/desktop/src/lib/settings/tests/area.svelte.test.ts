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
			reissuing: null,
			revoking: null,
			copying: null,
			endingSessions: null,
			codeFor: null,
			isChangingPassword: false,
			isChangingRole: false,
			isChangingAccess: false,
			onChangeLocale: noop,
			onRevealDiagnostics: noop,
			onChangePassword: resolved,
			onEndOtherSessions: resolved,
			onEndSessions: noop,
			onReissue: noop,
			onRevoke: noop,
			onCopyLink: noop,
			onFreshCode: noop,
			onRemove: noop,
			onLockOut: noop,
			onRename: resolved,
			onChangeRole: resolved,
			onChangeAccess: resolved,
			onChangeWorkspaceAccess: resolved,
			onDeleteWorkspace: resolved,
			onAuthorityReconnected: noop,
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

// criterion 14 and criterion 16, the sync section: the owner's own items are the Turso account
// and the organization's link, and a plain member meets neither. The status and the disconnect
// are everybody's, since a member reads whether their machine is reaching the workspace and
// leaves the organization from the same place the owner does.
test('the sync section gives the owner the turso account, the link and the disconnect', () => {
	at('?section=sync');
	area({ section: 'sync' });

	expect(screen.getByText(en.organization.dashboard.authorityTitle)).toBeDefined();
	expect(document.querySelector('[data-forget-account]')).not.toBeNull();
	expect(document.querySelector('[data-reconnect-authority]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.linkTitle)).toBeDefined();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(screen.getByText(en.workspace.syncDescription)).toBeDefined();
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
	expect(screen.queryByText(en.organization.dashboard.linkTitle)).toBeNull();
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
