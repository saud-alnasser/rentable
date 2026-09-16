import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Members from '$lib/organization/component/members.svelte';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import type { MemberStanding, OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';
import { EVERY_ADMINISTRATION, maskOf } from '@rentable/workspace-permission';

import Providers from './providers.svelte';

/**
 * THE MEMBERS, AS A DIRECTORY OF CARDS
 *
 * Criterion 19 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]: one
 * record card per account, each with its standing, the acts on the card's own menu by the gates
 * effort 826's requirement 15 set, the owner's card carrying an administrator nothing, and the add
 * at the foot. *It was a list of rows until the human saw them in the running build.*
 *
 * **What a card carries** is the username, the role, one line of standing and the workspaces held
 * as chips with their access. The standing is the pair a link is gated on read as a sentence, so
 * the card that offers no link is the card that says why.
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
 * **The address and the navigation are mocked**, the way `settings/tests/area.svelte.test.ts`
 * mocks the address: `$app/state` carries no navigation under this runner, and `goto` has no
 * router to reach.
 *
 * Requirement 21 of effort 824 holds throughout: a card names its member by the one username and
 * carries no address and no display name. Requirement 24's avatar is the same two letters the rail
 * draws.
 *
 * The rename's own refusal is still read here, against the sentence Rust carries, because the
 * dialog this section owns is where a person meets it. No submit is fired for that one: a
 * superforms SPA submit reaches SvelteKit's `applyAction`, which this runner does not carry, so
 * the refusal is reached the way a person first meets it, by leaving the field.
 */

const { address, navigations } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings?section=members') },
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
	// partial, because the rename dialog's `superForm` reaches `beforeNavigate` from the same
	// module: what is stood in for is the one navigation this section makes.
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async (to: string) => {
		navigations.push(to);
		address.url = new URL(to, 'http://localhost');
	}
}));

const noop = () => {};
const resolved = async () => {};

/** the reader is standing at the members section, with or without an account named on it. */
const at = (search = '?section=members') => {
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
		accessLevel: 'full-access'
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
	member({ id: 'owner', username: 'olivia', role: 'owner' }),
	member({
		id: 'ada',
		username: 'ada',
		role: 'administrator',
		workspaces: [
			{ id: 'ws-1', access: 'full-access' },
			{ id: 'ws-2', access: 'read-only' }
		]
	}),
	member({
		id: 'sami',
		username: 'sami',
		workspaces: [{ id: 'ws-1', access: 'full-access' }]
	})
];

const standing = (overrides: Partial<MemberStanding> & { memberId: string }): MemberStanding => ({
	passwordSet: true,
	machineSignedIn: false,
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
			workspaces,
			canInvite: true,
			canRemove: true,
			canLockOut: true,
			canRename: true,
			canReset: true,
			canChangeRole: true,
			canGrantWorkspace: true,
			isOwner: true,
			selfId: 'owner',
			makingLink: null,
			unsetting: null,
			endingSessions: null,
			isChangingRole: false,
			isChangingAccess: false,
			isOffering: false,
			isWithdrawing: false,
			offerRefusal: null,
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
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** the acts a card can offer, in the order they are built. */
const KINDS = [
	'withdraw-offer',
	'transfer',
	'rename',
	'edit',
	'link',
	'unset-password',
	'end-sessions',
	'remove',
	'lock-out'
] as const;

const on = (kind: string, id: string) => document.querySelector(`[data-member-${kind}="${id}"]`);
const card = (id: string) => document.querySelector(`[data-member="${id}"]`);

/** the one control a card carries, or nothing where this reader may do nothing to that account. */
const control = (id: string) => card(id)?.querySelector<HTMLButtonElement>('button') ?? null;

/** open a card's control, read what its menu offers, and close it again. */
const actsOn = async (id: string) => {
	const trigger = control(id);

	if (!trigger) return [];

	await fireEvent.click(trigger);

	const offered = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).map(
		(item) => KINDS.find((kind) => item.hasAttribute(`data-member-${kind}`)) ?? item.textContent
	);

	await fireEvent.click(trigger);

	return offered;
};

/** open a card's control and hand back one act's entry, the way a person reaches it. */
const openTo = async (id: string, kind: string) => {
	await fireEvent.click(control(id)!);

	return document.querySelector<HTMLElement>(`[data-member-${kind}="${id}"]`);
};

/** open a card's control and press one act. */
const press = async (id: string, kind: string) => {
	await fireEvent.click((await openTo(id, kind))!);
};
const surface = () => document.querySelector('[data-slot=form-surface]');
const usernameInput = () => document.querySelector<HTMLInputElement>('input[name=username]');

/** the one sentence Rust refuses a username outside the rules with, read off the source. */
const rustUsernameRules = () => {
	const source = readFileSync(
		// the runner's root is `apps/desktop`, and the crate sits beside `src` there.
		resolve(process.cwd(), 'tauri/src/organization/invite.rs'),
		'utf8'
	);
	const declared = /pub const USERNAME_RULES: &str = "([^"]+)";/.exec(source);

	if (!declared) throw new Error('invite.rs no longer declares USERNAME_RULES');

	return declared[1];
};

beforeEach(() => {
	resetOrganizationDialogs();
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
	expect(ada.textContent).toContain(en.layout.signIn.roleAdministrator);
	// one name on the card, and nothing that would carry a second one.
	expect(ada.querySelectorAll('[data-member-username]')).toHaveLength(1);
	expect(ada.textContent).not.toContain('@');
});

// the human's second look: a chip per workspace, each carrying its own access, read as a second
// list along the bottom of every card. What a card says now is how many, in one line; which ones
// and what each is good for is what the menu's workspaces entry opens.
test('a card says how many workspaces are held, in one line, and names none of them', () => {
	list({
		members: [
			member({ id: 'owner', username: 'olivia', role: 'owner' }),
			member({
				id: 'ada',
				username: 'ada',
				role: 'administrator',
				workspaces: [
					{ id: 'ws-1', access: 'full-access' },
					{ id: 'ws-2', access: 'read-only' }
				]
			}),
			member({ id: 'sami', username: 'sami', workspaces: [{ id: 'ws-1', access: 'full-access' }] })
		]
	});

	const held = (id: string) => {
		const line = card(id)!.querySelector('[data-member-workspaces]')!;

		return [line.getAttribute('data-member-workspaces'), line.textContent?.trim()];
	};

	// many, one, and none: the three forms, pluralised by the locale layer rather than by a
	// count printed beside a fixed word.
	const translations = i18nObject('en');

	expect(held('ada')).toEqual(['2', '2 workspaces']);
	expect(held('sami')).toEqual(['1', '1 workspace']);
	expect(held('owner')).toEqual(['0', en.organization.dashboard.noWorkspaces]);
	expect(translations.organization.dashboard.workspacesHeld({ count: 2 })).toBe('2 workspaces');
	expect(translations.organization.dashboard.workspacesHeld({ count: 1 })).toBe('1 workspace');

	// and no workspace is named on a card any more, nor what it is good for.
	expect(document.querySelector('[data-member-workspace]')).toBeNull();
	expect(document.body.textContent).not.toContain('Riyadh');
	expect(document.body.textContent).not.toContain(en.organization.dashboard.accessReadOnly);
});

// criterion 19: the three standings, each said in one line, read from the members query joined to
// the register on the member's id.
test('each card says where its account stands, in one of three lines', () => {
	const open = list();

	const lineOf = (id: string) => {
		const line = card(id)!.querySelector('[data-member-standing]')!;

		return [line.getAttribute('data-member-standing'), line.textContent?.trim()];
	};

	expect(lineOf('sami')).toEqual(['no-password', en.organization.dashboard.standingNoPassword]);
	expect(lineOf('ada')).toEqual(['no-machine', en.organization.dashboard.standingNoMachine]);
	expect(lineOf('owner')).toEqual(['signed-in', en.organization.dashboard.standingSignedIn]);
	open.unmount();

	// the standings are a second read, so the cards are drawn before they arrive, and a line
	// guessed from nothing would say something untrue about an account somebody is working on.
	list({ standings: [] });

	expect(document.querySelectorAll('[data-member-standing]')).toHaveLength(0);
	expect(document.querySelectorAll('[data-member]')).toHaveLength(3);
});

// requirement 19: the section says what it is for in the tray above the cards, and the tray is
// what the contracts view has.
test('the section says who is listed and what it is for, in the tray', () => {
	list();

	const tray = document.querySelector('[data-directory-tray]')!;

	expect(tray.querySelector('[data-directory-description]')?.textContent?.trim()).toBe(
		en.organization.dashboard.membersDescription
	);
	expect(tray.querySelector('legend')?.textContent?.trim()).toBe(en.settings.section.members);
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

	expect(opens.getAttribute('href')).toBe('/settings?section=members&member=ada');
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
	at('?section=members&member=ada');
	list();

	await waitFor(() => {
		expect(document.querySelector('[data-member-sheet]')).not.toBeNull();
	});
	expect(
		screen.getByText(
			en.organization.dashboard.memberSheetDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
	expect(navigations).toEqual(['/settings?section=members']);
});

test('an address naming nobody opens nothing and navigates nowhere', () => {
	list();

	expect(surface()).toBeNull();
	expect(navigations).toEqual([]);
});

// criterion 19: each act sits behind its own act. The owner reading holds all seven, so every act
// is on every card but their own.
test('the owner sees every act on every card but their own', async () => {
	list();

	expect(await actsOn('ada')).toEqual([
		'rename',
		'edit',
		'link',
		'unset-password',
		'end-sessions',
		'remove',
		'lock-out'
	]);
	expect(await actsOn('sami')).toEqual([
		'rename',
		'edit',
		'link',
		'unset-password',
		'end-sessions',
		'remove',
		'lock-out'
	]);
});

// requirement 19: the owner's account is removed by nobody and edited by nobody but the owner, so
// an administrator meets a card with no menu at all and no gesture behind it.
test('the owner card carries an administrator nothing, and is drawn with no menu', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'ada' });

	expect(control('owner')).toBeNull();
	expect(await actsOn('owner')).toEqual([]);
	// a card with nothing to offer claims neither route, so there is no control to name either.
	expect(card('owner')?.querySelector('.sr-only')).toBeNull();
	// the reader's own card is still nobody's to write.
	expect(control('ada')).toBeNull();
});

// and the same card read by the owner: one act and no other, because nobody edits their own role,
// permissions or workspaces (requirement 19) and handing the organization over is the owner's own
// (requirement 22). The rest of the card is as empty as it was.
test('the owner card offers the owner the transfer alone', async () => {
	list();

	expect(await actsOn('owner')).toEqual(['transfer']);
	expect(on('transfer', 'owner')).toBeNull();
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
test('the owner card offers the withdrawal in the offer place while an offer stands', async () => {
	const withdrawn: string[] = [];

	list({
		members: [
			member({ id: 'owner', username: 'olivia', role: 'owner' }),
			member({ id: 'ada', username: 'ada', role: 'administrator', offeredOwnership: true }),
			member({ id: 'sami', username: 'sami' })
		],
		onWithdrawOffer: () => withdrawn.push('yes')
	});

	expect(await actsOn('owner')).toEqual(['withdraw-offer']);

	await press('owner', 'withdraw-offer');

	// it asks nothing: nothing is unsealed and what is undone is something this person did, so it
	// runs on the press rather than opening a surface.
	expect(withdrawn).toEqual(['yes']);
	expect(surface()).toBeNull();
});

// and it is the owner's: an administrator reading the owner's card still meets no menu at all,
// which is the card requirement 19 leaves empty for everybody but its holder.
test('an administrator meets no transfer on the owner card', async () => {
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

// and a lone owner is offered nothing to hand it to, so the act is absent rather than opening a
// surface with an empty chooser.
test('an owner who is the only account meets no handover', async () => {
	list({
		members: [member({ id: 'owner', username: 'olivia', role: 'owner' })],
		standings: [standing({ memberId: 'owner', machineSignedIn: true })]
	});

	expect(control('owner')).toBeNull();
	expect(await actsOn('owner')).toEqual([]);
});

// [[rules/interface]], *Validation errors*: the shell refuses a password that does not open the
// owner's vault, so that is the field the sentence belongs to and the surface stays open.
test('a refused offer marks the password and the surface stays open', async () => {
	list({ offerRefusal: 'that value did not open' });

	await press('owner', 'transfer');

	const password = document.querySelector<HTMLInputElement>(
		'[data-transfer-ownership-form] input[type=password]'
	);

	expect(password?.getAttribute('aria-invalid')).toBe('true');
	expect(screen.getByText('that value did not open')).toBeDefined();
});

// the same rule on a card that is not the owner's: an administrator reading their own card is
// offered none of the three either. Rust refuses each of them on the row of whoever is asking,
// `invite::rename_member` by name.
test('a reader meets no edit on their own card', async () => {
	list({ isOwner: false, canLockOut: false, selfId: 'ada' });

	expect(control('ada')).toBeNull();
	expect(await actsOn('ada')).toEqual([]);
	// and everybody else's card is still theirs to write.
	expect(await actsOn('sami')).toContain('edit');
});

test('a member holding no act sees no card action at all, and no add control', () => {
	list({
		canInvite: false,
		canRemove: false,
		canLockOut: false,
		canRename: false,
		canReset: false,
		canChangeRole: false,
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
			canChangeRole: false,
			canGrantWorkspace: false,
			isOwner: false,
			selfId: 'owner',
			...overrides
		});

		expect(await actsOn(id), offered.join()).toEqual(offered);
		rendered.unmount();
	};

	// one entry, and either act draws it: the sheet holds whichever section that act writes.
	await only({ canChangeRole: true }, 'ada', ['edit']);
	await only({ canGrantWorkspace: true }, 'ada', ['edit']);
	await only({ canChangeRole: true, canGrantWorkspace: true }, 'ada', ['edit']);
	await only({ canRename: true }, 'ada', ['rename']);
	// unsetting a password and closing the ways in that are already open are one act read twice.
	await only({ canReset: true }, 'ada', ['unset-password', 'end-sessions']);
	await only({ canRemove: true }, 'ada', ['remove']);
	// the lock-out needs the Turso authority as well as the act, so it takes both.
	await only({ canRemove: true, canLockOut: true }, 'ada', ['remove', 'lock-out']);
	await only({ canInvite: true }, 'ada', ['link']);
	// and no act reaches the owner's card or the reader's own, whichever act the reader holds.
	// the owner's own card offers the one act that is theirs, and nothing a permission gates.
	await only({ canGrantWorkspace: true, isOwner: true, selfId: 'owner' }, 'owner', ['transfer']);
	await only({ canGrantWorkspace: true, selfId: 'ada' }, 'ada', []);
	await only({ canChangeRole: true, selfId: 'ada' }, 'ada', []);
	await only({ canRename: true, selfId: 'ada' }, 'ada', []);
});

// effort 828, requirement 20 and ticket 14's gate: an account with a password is offered a link
// only while no machine is signed in on it, and an account whose password is not set is offered one
// either way. The line the card already carries is what says why the act is absent.
test('the link act follows the standing, and the card says why it is not offered', async () => {
	const open = list();

	// sami has no password yet and ada has one with nobody signed in: both are offered a link.
	expect(await actsOn('sami')).toContain('link');
	expect(await actsOn('ada')).toContain('link');

	const entry = await openTo('sami', 'link');

	expect(entry?.textContent?.trim()).toBe(en.organization.dashboard.makeLink);
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

	expect(await actsOn('ada')).not.toContain('link');
	expect(card('ada')?.querySelector('[data-member-standing]')?.textContent?.trim()).toBe(
		en.organization.dashboard.standingSignedIn
	);
	// an account with no password is offered one even so: nobody is signed in that it would double.
	expect(await actsOn('sami')).toContain('link');
	signedIn.unmount();

	// **and the act is absent while the standings are unknown** (ticket 20, the review's tenth
	// finding). The standings are a second read: a card drawn before they arrive, or after they
	// failed, carries no standing line, and an account whose standing nothing knows was being
	// offered the one act that standing gates. What follows is a link Rust refuses, on a card whose
	// own line says nothing about why.
	const loading = list({ standings: [] });

	expect(await actsOn('ada')).not.toContain('link');
	expect(await actsOn('sami')).not.toContain('link');
	// and the rest of the card is drawn as it was: it is the link alone that waits.
	expect(await actsOn('ada')).toContain('rename');
	loading.unmount();
});

// criterion 22 of effort 826: ending somebody's sessions is `resetPassword`'s, beside the reset and
// never on the owner's card or the reader's own. The press reaches the route, which is where the
// mutation is.
test('signing a member out of every machine is offered behind reset password, and never on the owner', async () => {
	const asked: string[] = [];

	list({ selfId: 'ada', isOwner: false, onEndSessions: (memberId) => asked.push(memberId) });

	expect(await actsOn('owner')).not.toContain('end-sessions');
	expect(await actsOn('ada')).not.toContain('end-sessions');
	expect(await actsOn('sami')).toContain('end-sessions');

	const entry = await openTo('sami', 'end-sessions');

	expect(entry?.textContent?.trim()).toBe(en.organization.dashboard.endSessions);

	await fireEvent.click(entry!);

	expect(asked).toEqual(['sami']);
});

test('a card hands its own account to the link, the reset and the removals', async () => {
	const linked: string[] = [];
	const unset: string[] = [];
	const removed: string[] = [];
	const lockedOut: string[] = [];

	list({
		onMakeLink: (memberId) => linked.push(memberId),
		onUnsetPassword: (memberId) => unset.push(memberId),
		onRemove: (memberId) => removed.push(memberId),
		onLockOut: (memberId) => lockedOut.push(memberId)
	});

	await press('sami', 'link');
	await press('sami', 'unset-password');
	await press('sami', 'remove');
	await press('sami', 'lock-out');

	expect(linked).toEqual(['sami']);
	expect(unset).toEqual(['sami']);
	expect(removed).toEqual(['sami']);
	expect(lockedOut).toEqual(['sami']);
});

// the human's first look: the menu's words are one or two apiece, and the sentence that explains
// an act belongs to the surface it opens. *Two entries read as headings, `role and permissions`
// and `workspaces and access`, and a third as a sentence, `reset the password`.*
test('every act on the menu reads as one or two plain words', async () => {
	list();

	await fireEvent.click(control('ada')!);

	const said: Record<string, string> = Object.fromEntries(
		[...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map((item) => [
			KINDS.find((kind) => item.hasAttribute(`data-member-${kind}`)) ?? '?',
			item.textContent?.trim() ?? ''
		])
	);

	expect(said).toEqual({
		rename: en.organization.dashboard.rename,
		edit: en.common.actions.edit,
		link: en.organization.dashboard.makeLink,
		'unset-password': en.organization.dashboard.unsetPassword,
		'end-sessions': en.organization.dashboard.endSessions,
		remove: en.organization.dashboard.remove,
		'lock-out': en.organization.dashboard.lockOut
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

	expect(on('remove', 'sami')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('lock-out', 'sami')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('rename', 'sami')?.getAttribute('data-variant')).toBe('default');
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
	).toEqual(['role', 'acts', 'workspaces']);
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
test('one save writes the role, the widening and the grants through the acts that exist', async () => {
	const roles: string[] = [];
	const grants: string[] = [];

	list({
		onChangeRole: async (memberId, role, permissions) => {
			roles.push(`${memberId}:${role}:${permissions}`);
		},
		onChangeAccess: async (memberId, changes) => {
			grants.push(`${memberId}:${changes.map((change) => `${change.id}=${change.access}`).join()}`);
		}
	});

	await press('sami', 'edit');

	// sami holds ws-1 and nothing else, and is allowed nothing beyond their role. The picker ticks
	// what is to be allowed and its one confirm puts it on the list.
	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-act-add]')!);
	await fireEvent.click(
		document.querySelector<HTMLButtonElement>(
			'[data-act-offer="renameMember"] [data-slot=checkbox]'
		)!
	);
	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-act-allow]')!);
	await openSelect(document.querySelector<HTMLElement>('#access-ws-2')!);
	await chooseOption(
		document
			.querySelector('[data-level-does="full-access"]')!
			.closest('[data-slot=select-item]') as HTMLElement
	);
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(roles).toEqual([`sami:member:${maskOf('renameMember')}`]);
	});
	expect(grants).toEqual(['sami:ws-2=full-access']);
	// nothing was refused, so the sheet closed on what it wrote.
	await waitFor(() => {
		expect(surface()).toBeNull();
	});
});

// [[rules/interface]], *Validation errors*: what an act refuses is said on the section that asked
// for it, and the sheet stays open on what was chosen.
test('a refused act marks its own section and leaves the sheet open', async () => {
	list({
		onChangeAccess: async () => {
			throw new Error('that workspace is not yours to grant');
		}
	});

	await press('sami', 'edit');

	await openSelect(document.querySelector<HTMLElement>('#access-ws-2')!);
	await chooseOption(
		document
			.querySelector('[data-level-does="full-access"]')!
			.closest('[data-slot=select-item]') as HTMLElement
	);
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

// requirement 23: what each role may do is read from the tray, beside the add, and written
// nowhere.
test('the tray opens the read-only role table, beside the add', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.organization.roleTable.title });
	const tray = document.querySelector('[data-directory-tray]')!;

	expect(tray.contains(opener)).toBe(true);
	// quiet and glyph-only, like the add it stands beside.
	expect(opener.querySelector('svg')).not.toBeNull();
	expect(opener.textContent?.trim()).toBe('');
	expect(document.querySelector('[data-role-table]')).toBeNull();

	await fireEvent.click(opener);

	const table = document.querySelector('[data-role-table]')!;

	expect(table).not.toBeNull();
	// a column per role, and a row per act with its sentence.
	expect(
		Array.from(table.querySelectorAll('[data-role-column]')).map((column) =>
			column.getAttribute('data-role-column')
		)
	).toEqual(['member', 'administrator', 'owner']);
	expect(
		Array.from(table.querySelectorAll('[data-role-act]')).map((row) =>
			row.getAttribute('data-role-act')
		)
	).toEqual([
		...EVERY_ADMINISTRATION,
		'createWorkspace',
		'deleteWorkspace',
		'lockOut',
		'renew',
		'tursoAccount'
	]);
	expect(screen.getByText(en.organization.acts.inviteMember.does)).toBeDefined();
	// the acts nobody can be given, under the owner, with the reason said once.
	expect(screen.getByText(en.organization.roleTable.ownerAloneReason)).toBeDefined();
	expect(screen.getByText(en.organization.roles.owner.who)).toBeDefined();
	// and nothing on it writes.
	expect(table.querySelectorAll('input, [data-slot=select-trigger]')).toHaveLength(0);
});

// the table is a reference, so everybody who reads the section reads it, whatever they may write.
test('the role table is offered to a reader who may change nothing', () => {
	list({
		canInvite: false,
		canRemove: false,
		canLockOut: false,
		canRename: false,
		canReset: false,
		canChangeRole: false,
		canGrantWorkspace: false,
		isOwner: false,
		selfId: 'sami'
	});

	expect(document.querySelector('[data-invite-open]')).toBeNull();
	expect(document.querySelector('[data-role-table-open]')).not.toBeNull();
});

test('the rename opens a light form surface with one username field, opened on the name the card holds', async () => {
	list();

	await press('ada', 'rename');

	expect(surface()).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.organization.dashboard.renameDescription)).toBeDefined();
	expect(
		Array.from(surface()!.querySelectorAll('input')).map((input) => input.getAttribute('name'))
	).toEqual(['username']);
	expect(usernameInput()?.value).toBe('ada');
});

// criterion 23 of effort 824: a username outside the rules is refused on the field with the one
// sentence, and the sentence is Rust's own.
test('a username outside the rules is refused with the sentence rust refuses it with', async () => {
	list();

	await press('ada', 'rename');

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'ad' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());
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
	expect(card('sami')?.querySelector('[data-member-standing]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.standingNoPassword
	);
	// the count line too, pluralised and numbered by the Arabic locale rather than by a
	// substitution this test performs.
	expect(card('sami')?.querySelector('[data-member-workspaces]')?.textContent?.trim()).toBe(
		i18nObject('ar').organization.dashboard.workspacesHeld({ count: 1 })
	);
	expect(ar.organization.dashboard.workspacesHeld).not.toBe(
		en.organization.dashboard.workspacesHeld
	);
	expect(ar.organization.dashboard.standingNoPassword).not.toBe(
		en.organization.dashboard.standingNoPassword
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
	expect(on('remove', 'ada')?.textContent?.trim()).toBe(ar.organization.dashboard.remove);
	expect(on('edit', 'ada')?.textContent?.trim()).toBe(ar.common.actions.edit);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.lockOut);

	setLocale('en');
});
