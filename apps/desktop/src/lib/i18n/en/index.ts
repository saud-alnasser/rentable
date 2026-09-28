import type { BaseTranslation } from '../i18n-types';
import * as complex from '../../complex/i18n/en.js';
import * as contract from '../../contract/i18n/en.js';
import * as create from '../../create/i18n/en.js';
import * as dashboard from '../../dashboard/i18n/en.js';
import * as history from '../../history/i18n/en.js';
import * as list from '../../list/i18n/en.js';
import * as organization from '../../organization/i18n/en.js';
import * as palette from '../../palette/i18n/en.js';
import * as payment from '../../payment/i18n/en.js';
import * as permission from '../../permission/i18n/en.js';
import * as print from '../../print/i18n/en.js';
import * as settings from '../../settings/i18n/en.js';
import * as shell from '../../shell/i18n/en.js';
import * as shortcut from '../../shortcut/i18n/en.js';
import * as startup from '../../startup/i18n/en.js';
import * as tenant from '../../tenant/i18n/en.js';
import * as transfer from '../../transfer/i18n/en.js';
import * as undo from '../../undo/i18n/en.js';
import * as workspace from '../../workspace/i18n/en.js';

const en = {
	app: {
		name: 'rentable'
	},

	common: {
		actions: {
			actions: 'actions',
			add: 'add',
			cancel: 'cancel',
			checkForUpdates: 'check for updates',
			checkingForUpdates: 'checking for updates...',
			clearFilter: 'clear this filter',
			clearFilters: 'clear filters',
			clearSearch: 'clear search',
			clearSearchAndFilters: 'clear search and filters',
			clearSelection: 'clear selection',
			connect: 'connect',
			copyDetails: 'copy details',
			details: 'details',
			chooseFile: 'choose a file...',
			create: 'create',
			creating: 'creating...',
			customizeColumns: 'customize columns',
			delete: 'delete',
			deleting: 'deleting...',
			downloadAndInstall: 'download & install',
			duplicate: 'duplicate',
			edit: 'edit',
			export: 'export',
			exportSelection: 'export selection',
			goBack: 'go back',
			import: 'import',
			installingUpdate: 'installing update...',
			join: 'join',
			newComplex: 'new complex',
			newContract: 'new contract',
			newPayment: 'new payment',
			newRecord: 'new record',
			newTenant: 'new tenant',
			newUnit: 'new unit',
			openMenu: 'open menu',
			openPayments: 'open payments',
			openPreviousRelease: 'open previous release',
			proceed: 'proceed',
			remind: 'remind tenant',
			remove: 'remove',
			renew: 'renew',
			renewing: 'renewing...',
			restore: 'restore',
			restoring: 'restoring...',
			restartApp: 'restart app',
			retry: 'retry',
			retryStartup: 'retry startup',
			rollback: 'rollback',
			rollingBack: 'rolling back...',
			save: 'save',
			saveDatabasePath: 'save database path',
			saveWindow: 'save window',
			saving: 'saving...',
			selectRecords: 'select records',
			signIn: 'sign in',
			signOut: 'sign out',
			sortBy: 'sort by',
			terminate: 'terminate',
			transferData: 'import and export',
			terminating: 'terminating...',
			unterminate: 'unterminate',
			update: 'update',
			useDefaultPath: 'use default path',
			working: 'working...'
		},

		errors: {
			busy: 'another operation is already running.',
			cancelled: 'the operation was cancelled.',
			credential: 'the saved credentials could not be used.',
			database: 'the database could not complete the request.',
			forbidden: 'this action is not allowed.',
			integrity: 'the data does not match what was expected.',
			internal: 'something went wrong inside the app.',
			invalidInput: 'the information provided is not valid.',
			io: 'a file could not be read or written.',
			network: 'the app could not reach the internet. check your connection and try again.',
			notConfigured: 'this feature is not set up yet.',
			notFound: 'the item could not be found.',
			preconditionFailed: 'something has to be ready before this can run.',
			refused: 'this was refused, and nothing was changed.',
			timedOut: 'the operation took too long and stopped.'
		},

		export: list.common.export,

		failures: {
			forbidden: 'your role does not allow this in this workspace.',
			invalidInput: 'something entered is not valid. check it and try again.',
			signedOut: 'sign in to do this.'
		},

		formats: {
			csv: 'csv',
			xlsx: 'excel workbook'
		},

		import: transfer.common.import,

		history: history.common.history,

		labels: {
			action: 'action',
			activeContracts: 'active contracts',
			amount: 'amount',
			appVersion: 'app version',
			availableVersion: 'available version',
			complex: 'complex',
			contract: 'contract',
			contractEnds: 'contract ends',
			contractNumber: 'contract number',
			contractPeriod: 'contract period',
			contractStatus: 'contract status',
			costPerPayment: 'cost per cycle',
			currentDatabasePath: 'current database path',
			currentValue: 'current value',
			currentVersion: 'current version',
			customDatabasePathOverride: 'custom database path override',
			cycle: 'cycle',
			defaultDatabasePath: 'default database path',
			dueBalance: 'due balance',
			dueBalanceCoveredToDate: 'due balance covered to date',
			end: 'end',
			expected: 'expected',
			governmentId: 'government ID',
			information: 'information',
			governmentIdOptional: 'government ID (optional)',
			location: 'location',
			name: 'name',
			nationalId: 'national ID',
			noticeWindowDays: 'notice window (days)',
			occupiedUnits: 'occupied units',
			payment: 'payment',
			paid: 'paid',
			paymentDate: 'payment date',
			period: 'period',
			paymentFulfillment: 'payment fulfillment',
			phone: 'phone',
			rank: 'attention',
			releaseDate: 'release date',
			releaseNotes: 'release notes',
			remainingDueBalance: 'remaining due balance',
			start: 'start',
			status: 'status',
			tenant: 'tenant',
			unit: 'unit',
			units: 'units',
			vacantUnits: 'vacant units'
		},

		messages: {
			copied: 'copied to the clipboard',
			copyFailed: 'nothing could be copied.',
			exported: 'exported to {path:string}',
			loadingRecord: 'loading record...',
			loadingSettings: 'loading settings...',
			noMatch: 'nothing matches',
			recordNotFound: 'this record does not exist',
			recordNotFoundDescription: 'it may have been deleted.',
			unexpectedError: 'unexpected error occurred!',
			unknown: 'unknown'
		},

		nav: {
			account: 'account',
			complexes: 'complexes',
			contracts: 'contracts',
			dashboard: 'dashboard',
			payments: 'payments',
			primary: 'primary',
			settings: 'settings',
			tenants: 'tenants',
			units: 'units',
			workspace: 'workspace'
		},

		periods: list.common.periods,

		permission: permission.common.permission,

		// what a procedure's refusal says, by the code it was raised with (`$lib/api/refusal`). A
		// refusal crosses as a code and its values, and this is the only place it becomes words.
		refusals: {
			complex: complex.refusals.complex,
			contract: contract.refusals.contract,
			// what the shell says, by the reason a Rust refusal carries (`$lib/error/tauri`). Its own
			// message is a developer's description; this is what the reader is told.
			host: {
				lapsed: 'this link has lapsed. ask whoever sent it for a new one.',
				consumed: 'this link was already used. ask whoever sent it for a new one.',
				revoked: 'this link was withdrawn. ask whoever sent it for a new one.',
				replaced: 'a newer link replaced this one. ask whoever sent it for the new one.',
				codeMissing: 'type the six-character code that came with the link.',
				codeWrong: 'the code is wrong. ask whoever sent the link to read it out again.',
				linkUnreadable: 'this is not a rentable join link. copy the whole link and try again.',
				linkNotAnInvitation:
					'this link connects another machine rather than inviting you. sign in with your username and password instead.',
				linkNotForAMachine:
					'this link is an invitation rather than a link for another machine. open it where you accept an invitation.',
				anotherOrganizationHeld:
					'this machine already holds another organization. disconnect it first.',
				credentialsWrong: 'the username or password is wrong.',
				passwordTooShort: 'the password needs at least 12 characters.',
				passwordChangeRequired: 'change your password before doing anything else.',
				signedOut: 'nobody is signed in on this machine. sign in and try again.',
				noOrganization: 'this machine holds no organization yet.',
				noMemberYet: 'nobody has signed in to the organization on this machine yet. sign in first.',
				signInAgain: 'your account on this machine is out of date. sign in again.',
				youWereRemoved: 'you were removed from this organization.',
				sessionsEnded: 'your sessions were ended from another machine. sign in again.',
				keyNotInForce: 'the organization was handed over, so only its new owner can do this.',
				usernameInvalid:
					'a username is 3 to 32 letters, digits, dots, underscores or hyphens, with no spaces.',
				usernameTaken: 'that username is already taken in this organization. choose another.',
				roleUnknown: 'choose one of the roles the organization has.',
				memberMissing: 'that member is no longer in this organization. reload to see what changed.',
				markNotAnImage: 'choose a PNG, JPEG or WebP image.',
				markTooLarge: 'the image is over 512 KB. choose a smaller one.',
				memberGone: 'this account is no longer in the organization.',
				memberRemoved:
					'that member was removed. make them an account again if they are to come back.',
				notYourself: 'you cannot do this to your own account. somebody who ranks above you can.',
				ownerProtected: "the owner's account is not changed this way. the organization is theirs.",
				ownerOnly: 'only the owner can do this. ask the owner.',
				ownerMachineOnly:
					"this needs the Turso account, which is connected on the owner's machine. ask the owner.",
				roleLacksAct: 'your role does not include this. ask a manager.',
				notAdministrator: 'only a manager can do this.',
				rankNotAbove: 'that role is not below your own. ask somebody who ranks above it.',
				roleUnsettled:
					"somebody not allowed to changed this member's record. somebody above them removes them and makes them an account again.",
				roleBuiltIn:
					"every organization has this role, so it is not renamed, moved or deleted. the owner's role always carries everything.",
				roleNameMissing: 'give the role a name.',
				roleNameTaken: 'another role has that name. choose a different one.',
				roleOutOfPlace: 'a role goes below the manager and above the member.',
				noRankBelow: 'there is no room left below your role. ask somebody who ranks above you.',
				ownerRoleNotAssigned:
					"the owner's role moves only when the owner hands the organization over.",
				complexNeedsViewing:
					'adding, editing or deleting complexes needs viewing them. turn on viewing complexes first.',
				unitNeedsViewing:
					'adding, editing or deleting units needs viewing them. turn on viewing units first.',
				tenantNeedsViewing:
					'adding, editing or deleting tenants needs viewing them. turn on viewing tenants first.',
				contractNeedsViewing:
					'adding, editing or deleting contracts needs viewing them. turn on viewing contracts first.',
				paymentNeedsViewing:
					'adding, editing or deleting payments needs viewing them. turn on viewing payments first.',
				recordFlagsOnly:
					'a workspace changes only what may be done to its records. set the rest across the organization.',
				alreadyOwner: 'you are the owner already. choose the account that is to have it.',
				accountNotSetUp:
					'that account has no password of its own yet. once they open their link and choose one, offer it again.',
				offerPending:
					'the organization is already offered to an account. withdraw that offer first.',
				offerAccepted:
					'the offer was already accepted, and the organization is theirs now. nothing was changed.',
				nothingOffered: 'no offer of this organization stands.',
				offererGone: 'the account that offered you the organization is no longer in it.',
				organizationNameMissing: 'the organization needs a name.',
				workspaceNameMissing: 'the workspace needs a name.',
				workspaceMissing:
					'that workspace is no longer in this organization. reload to see what changed.',
				noWorkspaceOpen: 'no workspace is open on this machine. open one and try again.',
				noGrant: 'you have no access to that workspace.',
				grantMissing: 'that member has no access to that workspace.',
				grantBeyondOwn: 'you can share only a workspace you have full access to yourself.',
				noOrganizationCredential:
					"this machine holds no access to the organization's records. sign in again and try once more.",
				workspaceNewer:
					'a newer version of rentable upgraded this workspace. update rentable to open it.',
				workspaceBehind:
					'this workspace needs upgrading, and read-only access cannot do it. ask a member with full access to open it once.',
				databaseRefused:
					'the database refused the request, and nothing was changed. try again later.',
				organizationOlder:
					'an older version made this organization. it waits for its owner to open it in this version, which upgrades it.',
				organizationUpgradeOffline:
					'upgrading this organization needs a connection. connect to the internet and sign in again; nothing was changed.',
				organizationChangesUnsendable:
					'this machine holds unsent changes the upgraded organization cannot take. disconnect it and connect again to drop them.',
				organizationCredentialLapsed:
					"this machine's access to the organization has lapsed. ask your organization for a new link to connect it again.",
				organizationNewer:
					'a newer version of rentable made this organization. update rentable to open it.',
				copyNotTaken:
					'no copy was taken before upgrading, so nothing was changed. check the connection and the backups folder, then try again.',
				shapeNotAsBuilt:
					'the upgrade failed its check, so nothing was changed. update rentable and try again; the diagnostics log says why.',
				tursoNotConnected:
					'this machine is not connected to the Turso account. connect it and try again.',
				consentNeededAgain:
					'Turso needs the consent granted again. connect the Turso account again.',
				consentGone: 'this consent is no longer waiting. start it again.',
				groupMismatch:
					'that is not the group the consent was given over. check the name and try again.',
				groupNeeded: 'Turso needs the name of the group you picked. type it below.',
				groupHoldsOrganization:
					'that group already holds an organization. pick another group or another Turso account.',
				groupEmpty:
					'the consent was given over a group that holds no organization. give it over the group that holds yours.',
				nothingToConnectTo:
					'this Turso account holds no organization to connect to. go back and make one.',
				createRefused: "Turso would not create the organization's database.",
				tursoRefused: 'Turso refused the request. trying again will not help.',
				tursoAccountRefused:
					"Turso refused the request because of the account itself. check the account's plan in Turso."
			},
			payment: payment.refusals.payment,
			record: {
				idTaken: 'another record already holds that ID.',
				idTakenNamed: 'another record already holds the ID {named:string}.'
			},
			tenant: tenant.refusals.tenant,
			unit: complex.refusals.unit,
			workspace: workspace.refusals.workspace
		},

		selection: list.common.selection,

		status: {
			active: 'active',
			defaulted: 'defaulted',
			expired: 'expired',
			fulfilled: 'fulfilled',
			occupied: 'occupied',
			overdue: 'overdue',
			scheduled: 'scheduled',
			terminated: 'terminated',
			vacant: 'vacant'
		},

		statusDescriptions: {
			active: 'active; payments on track',
			defaulted: 'ended; not paid in full',
			expired: 'ended; paid in full',
			fulfilled: 'active; paid in full',
			occupied: 'held by a contract running today',
			overdue: 'past its end date and still owing',
			scheduled: 'scheduled; starts in the future',
			terminated: 'manually terminated; locked for changes',
			vacant: 'held by no contract today'
		},

		table: list.common.table,

		time: {
			day: '{count} day',
			days: '{count} days'
		},

		undo: undo.common.undo,

		window: shell.common.window,

		ui: {
			breadcrumb: 'breadcrumb',
			close: 'close',
			...palette.ui,
			...shortcut.ui,
			loading: 'loading',
			mobileSidebarDescription: 'displays the mobile sidebar.',
			more: 'more',
			morePages: 'more pages',
			next: 'next',
			nextSlide: 'next slide',
			...create.ui,
			pagination: 'pagination',
			previous: 'previous',
			previousSlide: 'previous slide',
			search: 'search',
			sidebar: 'sidebar',
			toggleSidebar: 'toggle sidebar'
		},

		deleteDialog: {
			blockedContracts: '{count|number} {{contract still mentions|contracts still mention}} it',
			blockedDescription: 'this cannot be deleted while the following still depend on it.',
			blockedPayments: '{count|number} {{payment|payments}} recorded against it',
			blockedUnits: '{count|number} {{unit belongs|units belong}} to it',
			description: 'this cannot be undone.',
			unnamedRecord: 'this record'
		}
	},
	layout: {
		notFound: shell.layout.notFound,
		error: shell.layout.error,
		accountMenu: organization.layout.accountMenu,
		workspaceMenu: workspace.layout.workspaceMenu,
		noWorkspace: workspace.layout.noWorkspace,
		signIn: organization.layout.signIn,
		startup: startup.layout.startup
	},

	dashboard: dashboard.dashboard,

	settings: settings.settings,
	complexes: complex.complexes,

	tenants: tenant.tenants,

	contracts: { ...contract.contracts, payments: payment.payments },

	print: print.print,

	settingsHooks: settings.settingsHooks,

	organization: organization.organization,

	workspace: workspace.workspace,

	earlier: workspace.earlier
} satisfies BaseTranslation;

export default en;
