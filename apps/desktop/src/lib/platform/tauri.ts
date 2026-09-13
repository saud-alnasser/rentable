import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import {
	openUrl as openExternalUrl,
	revealItemInDir as revealInFileManager
} from '@tauri-apps/plugin-opener';
import { check, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

import type {
	AvailableUpdate,
	DiagnosticRecord,
	ExportSheet,
	Host,
	ImportTable,
	Invited,
	LinkFacts,
	LockOutCost,
	MemberRemoved,
	MigrationNotice,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationInvitation,
	OrganizationMember,
	OrganizationState,
	OrganizationWorkspace,
	Recovery,
	RemoteSyncState,
	ReplicationRefusal,
	Settings,
	SettingsChangeset,
	WorkspaceGrant
} from '$lib/platform/host';
import { withExtension } from '$lib/platform/path';

/**
 * The payload types belong to the port rather than to this implementation of it, and are
 * re-exported because the rest of the application already reaches for them here.
 *
 * `Host` itself is deliberately not among them. Re-exporting it would put the port back
 * behind the facade, and a second client kind reaching it that way would pull every
 * `@tauri-apps` package into its graph to read one type — which is the thing the separate
 * module exists to prevent.
 */
export type {
	AvailableUpdate,
	DiagnosticRecord,
	ExportCell,
	ExportSheet,
	ImportTable,
	Invited,
	HeldOrganization,
	LinkFacts,
	LinkStanding,
	LockOutCost,
	MemberRemoved,
	MigrationNotice,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationInvitation,
	OrganizationMember,
	OrganizationSession,
	OrganizationState,
	OrganizationWorkspace,
	Recovery,
	RemoteSyncState,
	RemoteSyncWorkspace,
	ReplicationRefusal,
	Settings,
	SettingsChangeset,
	UpdaterDownloadEvent,
	WorkspaceGrant
} from '$lib/platform/host';

/** the Rust side is `LINK_ARRIVED_EVENT` in `tauri/src/lib.rs`, and the two are one name. */
const LINK_ARRIVED_EVENT = 'organization:link';
/** the Rust side is `MIGRATION_EVENT` in `tauri/src/organization/command.rs`, one name. */
const MIGRATION_EVENT = 'organization:migration';

function mapUpdate(update: TauriUpdate): AvailableUpdate {
	return {
		currentVersion: update.currentVersion,
		version: update.version,
		date: update.date ?? null,
		body: update.body ?? null,
		rawJson: update.rawJson,
		downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
		close: () => update.close()
	};
}

/**
 * any tauri commands that are available to the API.
 */
export const tauri = {
	bootstrap: () => invoke<Recovery>('bootstrap'),
	window: {
		show: () => invoke<void>('window_show'),
		hide: () => invoke<void>('window_hide'),
		minimize: () => invoke<void>('window_minimize'),
		maximize: () => invoke<void>('window_maximize'),
		drag: () => invoke<void>('window_drag'),
		close: () => invoke<void>('window_close'),
		restart: () => invoke<void>('window_restart')
	},
	opener: {
		openUrl: (url: string) => openExternalUrl(url),
		revealItemInDir: (path: string) => revealInFileManager(path)
	},
	export: {
		/**
		 * Write text to the path the user chose, and answer with where it landed.
		 *
		 * The path is theirs, from the save dialog below — symmetric with `import.read`, which
		 * is handed one from the open dialog. Where a file may go stopped being this layer's
		 * question, and Rust's, the moment the reader was asked.
		 */
		write: (path: string, contents: string) => invoke<string>('export_write', { path, contents }),
		/**
		 * Write a workbook to the path the user chose, and answer with where it landed.
		 *
		 * The cells cross as the kinds of thing they are — a count as a count, a day as a day —
		 * and this side spells each one. A figure rendered before it crossed could not be added
		 * up by whatever opened the file, and carried a locale that file's reader never chose.
		 *
		 * A second command rather than a format argument on the one above, because the two
		 * differ in what they put on disk rather than in what they are asked for: the text one
		 * prepends a byte-order mark, and a workbook is an archive that three bytes in front of
		 * would corrupt.
		 */
		writeWorkbook: (path: string, sheets: ExportSheet[]) =>
			invoke<string>('export_write_workbook', { path, sheets })
	},
	import: {
		/**
		 * Read a file the user chose, as a table of text.
		 *
		 * Symmetric with `export.write`: both take a path the user picked through a dialog below,
		 * never one the web layer composed. Which file to read and which file to write are the
		 * same question asked in two directions, and both are the reader's to answer.
		 *
		 * What comes back is strings. Which column means what, and whether a row is a record, are
		 * questions about tenants and contracts that the reader does not answer.
		 */
		read: (path: string) => invoke<ImportTable>('import_read', { path }),
		/**
		 * Read every sheet of a file the user chose.
		 *
		 * What a whole workspace arrives as. The tables come back in the file's own order and each
		 * says which sheet it is — the caller matches them by that name and never by position,
		 * because a reader who dragged the tabs about handed over the same workspace.
		 */
		readBook: (path: string) => invoke<ImportTable[]>('import_read_book', { path })
	},
	dialog: {
		/**
		 * Ask the user for a file, answering its path or nothing where they walked away.
		 *
		 * The formats offered are the ones the export writes, because the file this reads is
		 * meant to be the file it produced.
		 */
		openFile: async () => {
			const chosen = await openFileDialog({
				multiple: false,
				directory: false,
				filters: [{ name: 'spreadsheet', extensions: ['csv', 'xlsx', 'xls', 'xlsm'] }]
			});

			return typeof chosen === 'string' ? chosen : null;
		},
		/**
		 * Ask the user where a file goes, answering its path or nothing where they walked away.
		 *
		 * The mirror of `openFile`, and the reason an export no longer decides for itself. The
		 * name the caller composed is what the dialog opens on, so a reader with no opinion
		 * presses one control; the extension it already carries decides the filter, because the
		 * format was chosen before this was asked.
		 *
		 * The extension is put back where the platform's dialog let the reader take it off. It
		 * is not the file's format — which command wrote it is — so a workbook named `.txt` is
		 * still a workbook, and it is a workbook nothing on the reader's machine will open.
		 */
		saveFile: async (defaultName: string) => {
			const extension = defaultName.split('.').pop() ?? '';
			const chosen = await saveFileDialog({
				defaultPath: defaultName,
				filters: extension ? [{ name: extension, extensions: [extension] }] : []
			});

			return typeof chosen === 'string' ? withExtension(chosen, extension) : null;
		}
	},
	diagnostics: {
		write: (record: DiagnosticRecord) => invoke<void>('diagnostics_write', { record })
	},
	update: {
		prepare: (targetVersion: string) => invoke<Recovery>('update_prepare', { targetVersion }),
		check: async () => {
			const update = await check();

			return update ? mapUpdate(update) : null;
		}
	},
	settings: {
		get: () => invoke<Settings>('settings_get'),
		set: (changeset: SettingsChangeset) => invoke<Settings>('settings_set', { changeset })
	},
	organization: {
		consentBegin: () => invoke<OrganizationConsentStart>('organization_consent_begin'),
		consentResult: (sessionId: string) =>
			invoke<OrganizationConsentResult>('organization_consent_result', { sessionId }),
		consentDisconnect: () => invoke<void>('organization_consent_disconnect'),
		create: (name: string, username: string, password: string) =>
			invoke<OrganizationCreated>('organization_create', { name, username, password }),
		getState: () => invoke<OrganizationState>('organization_state_get'),
		connect: (link: string) => invoke<OrganizationState>('organization_connect', { link }),
		disconnect: () => invoke<OrganizationState>('organization_disconnect'),
		signIn: (username: string, password: string) =>
			invoke<OrganizationState>('organization_sign_in', { username, password }),
		signOut: () => invoke<OrganizationState>('organization_sign_out'),
		linkTake: () => invoke<string | null>('organization_link_take'),
		onLink: (listener: (link: string) => void) =>
			listen<string>(LINK_ARRIVED_EVENT, (event) => listener(event.payload)),
		onMigration: (listener: (notice: MigrationNotice) => void) =>
			listen<MigrationNotice>(MIGRATION_EVENT, (event) => listener(event.payload)),
		linkInspect: (link: string) => invoke<LinkFacts>('organization_link_inspect', { link }),
		reconnectAuthority: () => invoke<OrganizationState>('organization_reconnect_authority'),
		renewDue: () => invoke<boolean>('organization_renew_due'),
		ownLink: () => invoke<string>('organization_own_link'),
		workspace: {
			create: (name: string) => invoke<OrganizationWorkspace>('workspace_create', { name }),
			open: (workspaceId: string) =>
				invoke<OrganizationWorkspace>('workspace_open', { workspaceId }),
			grant: (workspaceId: string, memberId: string, access: 'full-access' | 'read-only') =>
				invoke<void>('workspace_grant', { workspaceId, memberId, access }),
			remove: (workspaceId: string) => invoke<void>('workspace_delete', { workspaceId }),
			renewCredentials: () => invoke<number>('organization_renew_credentials')
		},
		member: {
			list: () => invoke<OrganizationMember[]>('organization_members'),
			invite: (username: string, role: 'administrator' | 'member', workspaces: WorkspaceGrant[]) =>
				invoke<Invited>('member_invite', { username, role, workspaces }),
			reset: (memberId: string) => invoke<Invited>('member_reset', { memberId }),
			remove: (memberId: string, lockOut: boolean) =>
				invoke<MemberRemoved>('member_remove', { memberId, lockOut }),
			lockOutCost: (memberId: string) => invoke<LockOutCost>('member_lock_out_cost', { memberId }),
			rename: (memberId: string, username: string) =>
				invoke<OrganizationMember>('member_rename', { memberId, username })
		},
		invitation: {
			list: () => invoke<OrganizationInvitation[]>('organization_invitations'),
			revoke: (invitationId: string) => invoke<void>('invitation_revoke', { invitationId }),
			accept: (link: string, password: string) =>
				invoke<OrganizationState>('invitation_accept', { link, password }),
			link: (invitationId: string) => invoke<string>('invitation_link', { invitationId })
		},
		changePassword: (current: string, next: string) =>
			invoke<OrganizationState>('organization_change_password', { current, new: next }),
		accountRefusalDetail: () => invoke<string | null>('organization_account_refusal_detail')
	},
	remoteSync: {
		getState: () => invoke<RemoteSyncState>('remote_sync_state_get'),
		replicate: () =>
			invoke<{ pushed: boolean; received: boolean; refusal: ReplicationRefusal }>(
				'remote_sync_replicate'
			),
		push: () => invoke<boolean>('remote_sync_push'),
		renameWorkspace: (name: string) =>
			invoke<RemoteSyncState>('remote_sync_rename_workspace', { name })
	}
} satisfies Host;
