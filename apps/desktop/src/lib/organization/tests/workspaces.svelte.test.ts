import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Workspaces from '$lib/organization/component/workspaces.svelte';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { chooseOption, openSelect } from '$lib/design/tests/select';

import QueryProviders from './query-providers.svelte';

/**
 * THE WORKSPACES, RENDERED
 *
 * Criterion 16 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]]: one list of
 * the workspaces this member holds, a row carrying the name, the member count and whether it is
 * the one open here, each row action behind its own gate, and the new workspace control for the
 * owner holding the Turso authority alone. Export and import are in this section, beneath the
 * list and acting on the open workspace.
 *
 * **The gates are props and none of them is read from a permission here**, which is what lets the
 * two owner-only acts be asserted at all: creating and deleting a workspace are the owner's in
 * Rust rather than a bit on anybody's row (requirement 5), so the section is handed who is
 * reading, and the test renders one reader and then another.
 *
 * **The rename is the open workspace's**, because `remoteSync.rename` calls this machine's
 * workspace something else and there is no command that renames one from a distance. So the
 * control is behind `renameWorkspace` and behind the open mark, and both are read below.
 *
 * The rows the access dialog draws are the organization's members rather than its workspaces,
 * which is the same surface read the other way round; the owner is not among them, because Rust
 * refuses a withdrawal of the owner's own grant, and neither is the reader.
 */

const resolved = async () => {};

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
	pending: null,
	createdAt: 0,
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
			isOwner: true,
			selfId: 'owner',
			isChangingAccess: false,
			refusal: null,
			onChangeAccess: resolved,
			onDelete: resolved,
			...overrides
		},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction } }
	);

/** every control of one kind on the list, by the attribute the row marks it with. */
const controls = (kind: string) => document.querySelectorAll(`[data-workspace-${kind}]`).length;
const on = (kind: string, id: string) => document.querySelector(`[data-workspace-${kind}="${id}"]`);
const row = (id: string) => document.querySelector(`[data-workspace="${id}"]`);
const surface = () => document.querySelector('[data-slot=form-surface]');
const dialogTitle = () => document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim();
const dialogParagraphs = () =>
	Array.from(document.querySelectorAll('[data-slot="dialog-content"] p'));

/** the rail's own sentence for how many people are in a workspace, as the row draws it. */
const memberCount = (count: number) =>
	en.layout.workspaceMenu.members.replace('{count|number}', String(count));

beforeEach(() => {
	resetOrganizationDialogs();
	loadLocale('en');
	setLocale('en');
});

// criterion 16: a row is the name, the member count and whether it is the open one.
test('one row per workspace, carrying the name, the member count and the open mark', () => {
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

	// the open mark is on the one open here, and on no other row.
	expect(controls('open')).toBe(1);
	expect(on('open', 'ws-1')?.textContent?.trim()).toBe(en.layout.workspaceMenu.open);
	// and the access this reader holds, with the label folded into the value.
	expect(on('access', 'ws-1')?.textContent?.trim()).toBe(en.organization.dashboard.accessFull);
	expect(on('access', 'ws-2')?.textContent?.trim()).toBe(en.organization.dashboard.accessReadOnly);
	// the hostname is Turso's fact about a database, and no longer on the row.
	expect(row('ws-1')?.textContent).not.toContain('turso.io');
});

// criterion 16: rename, members and delete, each behind its gate.
test('an owner holding every gate sees members and delete on each row, and rename on the open one', () => {
	list();

	expect(controls('grant')).toBe(2);
	expect(controls('delete')).toBe(2);
	// the rename acts on the workspace this machine has open, so it is drawn on that row alone.
	expect(controls('rename')).toBe(1);
	expect(on('rename', 'ws-1')).not.toBeNull();
	expect(on('rename', 'ws-2')).toBeNull();
});

test('a member holding no act sees no row action at all', () => {
	list({
		canCreate: false,
		canDelete: false,
		canRename: false,
		canGrantWorkspace: false,
		isOwner: false,
		selfId: 'sami'
	});

	for (const kind of ['rename', 'grant', 'delete']) {
		expect(controls(kind), kind).toBe(0);
	}
	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-refusal]')).toBeNull();
});

// each gate on its own, so no control is being carried by a neighbour's.
test('each action is drawn by its own gate and by no other', () => {
	const only = (
		overrides: Partial<Parameters<typeof render<typeof Workspaces>>[1]>,
		kind: string,
		count: number
	) => {
		const rendered = list({
			canCreate: false,
			canDelete: false,
			canRename: false,
			canGrantWorkspace: false,
			isOwner: false,
			selfId: 'sami',
			...overrides
		});

		expect(controls(kind), kind).toBe(count);
		rendered.unmount();
	};

	only({ canRename: true }, 'rename', 1);
	only({ canRename: true }, 'grant', 0);
	only({ canGrantWorkspace: true }, 'grant', 2);
	only({ canGrantWorkspace: true }, 'delete', 0);
	only({ canDelete: true }, 'delete', 2);
	only({ canDelete: true }, 'rename', 0);
});

// criterion 16: new workspace is the owner's, and it needs the Turso authority as well, because
// creating a database is done on the machine that holds the consent.
test('new workspace is drawn for the owner holding the authority, and opens the shell dialog', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.layout.workspaceMenu.create });

	// requirement 14 of effort 824: the verb's glyph before its label.
	expect(opener.querySelector('svg')).not.toBeNull();
	expect(organizationDialog.open).toBeNull();
	await fireEvent.click(opener);
	expect(organizationDialog.open).toBe('workspace');
	// no form of its own: the one instance is mounted in the shell.
	expect(surface()).toBeNull();
});

test('an owner whose machine lost the authority reads why, and everybody else is offered neither', () => {
	const owner = list({
		canCreate: false,
		refusal: en.layout.workspaceMenu.workspaceRefusedAuthority
	});

	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-refusal]')?.textContent?.trim()).toBe(
		en.layout.workspaceMenu.workspaceRefusedAuthority
	);
	owner.unmount();

	// an administrator never had a create to be refused, so the section says nothing about one.
	list({ canCreate: false, isOwner: false, refusal: null, selfId: 'ada' });

	expect(document.querySelector('[data-workspace-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-refusal]')).toBeNull();
});

// criterion 16: export and import stay, in this section, acting on the open workspace.
test('export and import sit beneath the list, under a legend naming the open workspace', () => {
	list();

	expect(screen.getByRole('button', { name: en.common.actions.export })).toBeDefined();
	expect(screen.getByRole('button', { name: en.common.actions.import })).toBeDefined();
	expect(
		screen.getByText(
			en.organization.dashboard.transferTitle.replace('{workspace:string}', 'Riyadh')
		)
	).toBeDefined();
	expect(screen.getByText(en.workspace.transferDescription)).toBeDefined();
});

test('the members action opens the access dialog on the people who could hold that workspace', async () => {
	list();

	await fireEvent.click(on('grant', 'ws-2')!);

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

test('the members action hands up the rows that changed, as member ids on that workspace', async () => {
	const written: string[] = [];

	list({
		onChangeAccess: async (workspaceId, changes) => {
			written.push(
				`${workspaceId}:${changes.map((change) => `${change.memberId}=${change.access}`).join(',')}`
			);
		}
	});

	await fireEvent.click(on('grant', 'ws-2')!);
	await openSelect(document.querySelector<HTMLElement>('#access-ada')!);
	await chooseOption(screen.getByRole('option', { name: en.organization.dashboard.accessFull }));
	await fireEvent.submit(document.querySelector('form')!);

	expect(written).toEqual(['ws-2:ada=full-access']);
});

// criterion 16: delete asks once and names what is lost, and it is the owner's.
test('delete opens the packaged confirm, naming the workspace and what goes with it', async () => {
	list();

	await fireEvent.click(on('delete', 'ws-2')!);

	expect(dialogTitle()).toBe(en.organization.dashboard.deleteWorkspace);
	expect(dialogParagraphs()[0]?.textContent?.trim()).toBe('Jeddah');
	expect(dialogParagraphs()[1]?.textContent?.trim()).toBe(
		en.organization.dashboard.deleteWorkspaceDescription
	);
});

test('the rename opens the light form surface on the open workspace, with one name field', async () => {
	list();

	await fireEvent.click(on('rename', 'ws-1')!);

	expect(surface()).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.workspace.renameDescription)).toBeDefined();
	const fields = Array.from(surface()!.querySelectorAll<HTMLInputElement>('input'));

	expect(fields).toHaveLength(1);
	expect(fields[0]?.value).toBe('Riyadh');
});

// [[rules/interface]], *Row activation*: an action is a control on the row, never the row.
test('the actions are controls on the row, and the row itself opens nothing', () => {
	list();

	const riyadh = row('ws-1')!;

	expect(riyadh.tagName).toBe('DIV');
	expect(riyadh.getAttribute('role')).toBeNull();
	expect(riyadh.closest('a')).toBeNull();

	const cluster = document.querySelector('[data-workspace-actions="ws-1"]')!;

	for (const control of Array.from(cluster.querySelectorAll('button'))) {
		expect(control.getAttribute('aria-label')?.length).toBeGreaterThan(0);
	}
	// on hover and on focus: the cluster is faded rather than removed, so the row does not move
	// and the keyboard still reaches it.
	expect(cluster.className).toContain('opacity-0');
	expect(cluster.className).toContain('group-hover:opacity-100');
	expect(cluster.className).toContain('focus-within:opacity-100');
});

test('and in arabic every row reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(
		Array.from(document.querySelectorAll('[data-workspace-name]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['Riyadh', 'Jeddah']);
	expect(on('open', 'ws-1')?.textContent?.trim()).toBe(ar.layout.workspaceMenu.open);
	expect(on('access', 'ws-2')?.textContent?.trim()).toBe(ar.organization.dashboard.accessReadOnly);
	expect(ar.organization.dashboard.accessReadOnly).not.toBe(
		en.organization.dashboard.accessReadOnly
	);
	expect(screen.getByRole('button', { name: ar.layout.workspaceMenu.create })).toBeDefined();
	expect(
		screen.getByText(ar.organization.dashboard.transferTitle.replace('{workspace}', 'Riyadh'))
	).toBeDefined();

	setLocale('en');
});
