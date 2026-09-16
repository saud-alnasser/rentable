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
 * Criterion 14 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] and
 * criterion 24 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], read
 * where they can be read: the area is pure props, so two sessions are two renders, and what each
 * reader is offered is whatever reached the rail. A route could not be asked this, since no route
 * renders under this runner, and the gating would be behind four queries.
 *
 * **Each section is read by its blocks' marks and by the absence of the others'**, rather than by
 * the tab that is underlined: the rail says what a reader may open, and the body is what they
 * actually meet.
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
// that needs no organization: the language, the ending-soon figure, updates and diagnostics.
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

// requirement 24: general carries what it always did, then updates and diagnostics under their
// own legends, and nothing that belongs to one of the other three.
test('the general section carries the general blocks, then updates, then diagnostics', () => {
	at('?section=general');
	area({ section: 'general' });

	expect(orderOf('data-general', 'data-updates', 'data-diagnostics')).toEqual([
		'data-general',
		'data-updates',
		'data-diagnostics'
	]);

	expect(screen.getByText(en.settings.localeTitle)).toBeDefined();
	expect(screen.getByText(en.settings.endingSoonTitle)).toBeDefined();
	expect(screen.getByText(en.settings.updatesTitle)).toBeDefined();
	expect(screen.getByText(en.settings.updatesDescription)).toBeDefined();
	expect(screen.getByText(en.settings.diagnosticsTitle)).toBeDefined();
	expect(screen.getByText(en.settings.diagnosticsDescription)).toBeDefined();

	// and none of the other three sections' blocks.
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(document.querySelector('[data-identity]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).toBeNull();
	expect(document.querySelector('[data-workspace]')).toBeNull();
});

// requirement 24: the account section is what the you section held, and nothing else.
test('the account section carries the blocks the you section held, and none of the others', () => {
	at('?section=account');
	area({ section: 'account' });

	expect(document.querySelector('[data-identity]')).not.toBeNull();
	expect(document.querySelector('[data-password]')).not.toBeNull();
	expect(document.querySelector('[data-end-other-sessions]')).not.toBeNull();

	// who this reader is, then the one thing they change about themselves, then the machines they
	// left signed in. No offer stands here, so the section opens with the identity.
	expect(
		orderOf('data-ownership-offer', 'data-identity', 'data-password', 'data-end-other-sessions')
	).toEqual(['data-identity', 'data-password', 'data-end-other-sessions']);

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
	expect(document.querySelector('[data-forget-account]')).not.toBeNull();
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
			'data-forget-account',
			'data-members',
			'data-leaving',
			'data-disconnect',
			'data-delete-organization'
		)
	).toEqual([
		'data-standing-block',
		'data-forget-account',
		'data-members',
		'data-leaving',
		'data-disconnect',
		'data-delete-organization'
	]);

	// the two at the foot stand under one legend, so a reader knows what the last block is before
	// reading either description.
	const leaving = document.querySelector('[data-leaving]')!;

	expect(leaving.querySelector('legend')?.textContent?.trim()).toBe(
		en.organization.dashboard.leavingTitle
	);
	expect(leaving.querySelector('[data-disconnect]')).not.toBeNull();
	expect(leaving.querySelector('[data-delete-organization]')).not.toBeNull();
});

// criterion 25 of effort 828, from the area's side: the block at the top of the organization
// section states one sentence built from the standing and the moment, offers one "check now"
// control, draws no badge and carries the word "sync" on the control alone. Each standing's
// sentence is read in `organization/tests/standing.svelte.test.ts`; what is read here is that
// the section draws that block, first, with the moment the machine holds.
test('the organization section opens with one sentence on where this machine stands, and one check', () => {
	at('?section=organization');
	area({
		section: 'organization',
		syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * 60_000 })
	});

	const block = document.querySelector<HTMLElement>('[data-standing-block]')!;

	expect(block).not.toBeNull();
	// the legend and the sentence of purpose first, the shape every block here has.
	expect(block.querySelector('legend')?.textContent?.trim()).toBe(en.organization.standing.title);
	expect(block.querySelector('[data-standing-purpose]')?.textContent?.trim()).toBe(
		en.organization.standing.purpose
	);
	expect(block.querySelector('[data-standing-sentence]')?.textContent?.trim()).toBe(
		en.organization.standing.upToDateChecked.replace('{moment:string}', '2 minutes ago')
	);
	expect(block.querySelectorAll('[data-standing-sentence]')).toHaveLength(1);
	expect(block.querySelector('[data-check-now]')?.textContent?.trim()).toBe(
		en.organization.standing.checkNow
	);
	expect(block.querySelector('[data-slot="badge"]')).toBeNull();
	expect(
		(block.textContent ?? '')
			.replace(block.querySelector('[data-check-now]')?.textContent ?? '', '')
			.toLowerCase()
	).not.toContain('sync');
	// and it is the first block of the section.
	expect(
		orderOf('data-standing-block', 'data-forget-account', 'data-members', 'data-leaving')[0]
	).toBe('data-standing-block');
});

// an owner whose machine holds no authority meets the reconnect where the account block is, and
// no delete: the act needs the authority that block is about, which is the gate it had while it
// sat inside it.
test('an owner holding no authority meets the reconnect, and the foot is the disconnect alone', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(
		orderOf('data-standing-block', 'data-reconnect-authority', 'data-members', 'data-disconnect')
	).toEqual(['data-standing-block', 'data-reconnect-authority', 'data-members', 'data-disconnect']);
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

// criterion 22 of effort 826: the account section offers the reader a way to sign themselves out of
// every other machine, and asks once before it runs. The act is on the route; what is read here is
// that the control is there and that the question stands in front of it.
test('the account section offers signing out of other machines, behind one confirm', async () => {
	at('?section=account');
	area({ section: 'account' });

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
	expect(document.querySelector('[data-forget-account]')).not.toBeNull();
	expect(document.querySelector('[data-reconnect-authority]')).toBeNull();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(screen.getByText(en.organization.standing.notYetReached)).toBeDefined();
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
test('an administrator is offered no delete, because the act is the owners', () => {
	at('?section=organization');
	area({
		section: 'organization',
		session: fakeOrganizationSession({
			role: 'administrator',
			permissions: maskOf(...EVERY_ADMINISTRATION)
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

	expect(document.querySelector('[data-reconnect-authority]')).not.toBeNull();
	expect(document.querySelector('[data-forget-account]')).toBeNull();
	expect(screen.getByText(en.organization.dashboard.authorityDescription)).toBeDefined();
});

// criterion 22: an owner who was handed the organization holds no authority either, and the reason
// is not that this machine lost one. The block says where the authority does belong, in one short
// sentence, and offers the same reconnect.
test('an owner holding no authority is told the authority follows the account that consented', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: false });

	expect(screen.getByText(en.organization.dashboard.authorityFollowsTheAccount)).toBeDefined();
	expect(document.querySelector('[data-authority-follows-the-account]')).not.toBeNull();
	// and the offer beside it is the one that already existed.
	expect(document.querySelector('[data-reconnect-authority]')).not.toBeNull();
});

// and nobody else meets it: an owner whose machine holds the authority has nothing to be told, and
// a plain member never reads this block at all.
test('the sentence is absent for an owner who holds the authority', () => {
	at('?section=organization');
	area({ section: 'organization', holdsTursoAuthority: true });

	expect(document.querySelector('[data-authority-follows-the-account]')).toBeNull();
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

	expect(screen.getByText(en.organization.standing.notYetReached)).toBeDefined();
	expect(document.querySelector('[data-disconnect]')).not.toBeNull();
	expect(document.querySelector('[data-members]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.membersTitle)).toBeNull();
	expect(document.querySelector('[data-forget-account]')).toBeNull();
	expect(document.querySelector('[data-reconnect-authority]')).toBeNull();
	expect(screen.queryByText(en.organization.dashboard.authorityTitle)).toBeNull();
	expect(document.querySelector('[data-organization-link]')).toBeNull();

	// what is left is the standing and the way out, in that order.
	expect(orderOf('data-standing-block', 'data-members', 'data-leaving', 'data-disconnect')).toEqual(
		['data-standing-block', 'data-leaving', 'data-disconnect']
	);
	expect(document.querySelector('[data-delete-organization]')).toBeNull();
});

// criterion 16 from the area's side: the section is the list this member holds, with the rows
// the workspaces section draws, and the transfer beneath it. What each row offers is read in
// `workspaces.svelte.test.ts`.
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
// by the owner or an administrator from the account it admits into, so the section a person reads
// about themselves offers the identity, the password and the other machines, and nothing that
// hands a link over. *It offered a second-machine act until requirement 20 superseded requirement
// 3.*
test('the account section offers no link act, and nothing on it hands a link over', () => {
	at('?section=account');
	area({ section: 'account' });

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
		orderOf('data-ownership-offer', 'data-identity', 'data-password', 'data-end-other-sessions')
	).toEqual(['data-ownership-offer', 'data-identity', 'data-password', 'data-end-other-sessions']);

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
