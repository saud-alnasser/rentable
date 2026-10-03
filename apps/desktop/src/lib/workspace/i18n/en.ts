// The workspace feature's strings in english, composed back into `i18n/en/index.ts` at `workspace`,
// `earlier`, `layout.workspaceMenu`, `layout.noWorkspace` and `common.refusals.workspace`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const workspace = {
	nameTooLong: 'that name is too long.',
	nameRequired: 'give this workspace a name.',
	renameDescription: 'what this workspace is called, on every machine signed in to it.',
	renamed: 'the workspace was renamed.',
	credentialRefused:
		'your access was renewed and this machine is fetching it. work goes on here; if it does not clear, ask the owner.',
	accountRefusedMember:
		"the organization's Turso account needs attention, so nothing reaches Turso for now. tell {owner}. work here goes on.",
	accountRefusedOwner:
		"Turso is refusing the organization's account: {detail}. work goes on here; fix it at app.turso.tech to send it.",
	accountRefusedOwnerNoDetail:
		"Turso is refusing the organization's account. work goes on here; fix it at app.turso.tech to send it."
} satisfies BaseTranslation;

// the records 0.12.0 and 0.13.0 left on this machine, offered on the way in and above the settings
// area's workspace cards until they are brought in or put aside (effort 838, requirement 18).
export const earlier = {
	wayIn:
		'records from version {version:string} are on this machine. bring them in from settings once there is a workspace.',
	title: 'records from version {version:string}',
	description:
		'they are still on this machine. review what they would add, then bring them into {workspace:string}.',
	openOne: 'they are still on this machine. open a workspace to bring them in.',
	kept: 'a copy is kept as a workbook:',
	bringIn: 'bring them in...',
	dismiss: 'dismiss'
} satisfies BaseTranslation;

export const layout = {
	workspaceMenu: {
		create: 'new workspace',
		members: '{count|number} {{member|members}}',
		open: 'open',
		manage: 'workspace settings',
		workspaceRefusedAuthority:
			'creating a workspace needs the Turso account. reconnect it in settings, under organization.'
	},

	noWorkspace: {
		nameLabel: 'workspace name',
		create: 'create workspace',
		creating: 'creating the workspace on your Turso account. this takes a moment.',
		created: 'the workspace was created.',
		ownerOnly:
			'only the owner can create the first workspace, from the machine that connected the Turso account.',
		title: 'no workspace yet',
		description:
			'your organization has no workspace yet. create the first one to start keeping records.'
	}
} satisfies BaseTranslation;

export const refusals = {
	workspace: {
		nothingToImport: 'there is nothing to import.',
		unknownComplex: 'the file names a complex called {name:string}, and there is none.',
		unknownContract: 'the file names a contract called {name:string}, and there is none.',
		unknownTenant: 'the file names a tenant called {name:string}, and there is none.',
		unknownUnit: 'the file names a unit called {name:string}, and there is none.'
	}
} satisfies BaseTranslation;
