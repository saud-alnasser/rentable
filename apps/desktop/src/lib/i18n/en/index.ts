import type { BaseTranslation } from '../i18n-types';
import * as complex from '../../complex/i18n/en.js';
import * as unit from '../../complex/unit/i18n/en.js';
import * as contract from '../../contract/i18n/en.js';
import * as create from '../../create/i18n/en.js';
import * as dashboard from '../../dashboard/i18n/en.js';
import * as history from '../../history/i18n/en.js';
import * as list from '../../list/i18n/en.js';
import * as organization from '../../organization/i18n/en.js';
import * as organizationSession from '../../organization/session/i18n/en.js';
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
import * as update from '../../update/i18n/en.js';
import * as workspace from '../../workspace/i18n/en.js';

const en = {
	app: {
		name: 'rentable'
	},

	common: {
		actions: {
			add: 'add',
			cancel: 'cancel',
			clearSearch: 'clear search',
			copyDetails: 'copy details',
			details: 'details',
			chooseFile: 'choose a file...',
			create: 'create',
			customizeColumns: 'customize columns',
			delete: 'delete',
			deleting: 'deleting...',
			duplicate: 'duplicate',
			edit: 'edit',
			export: 'export',
			import: 'import',
			...complex.common.actions,
			...contract.common.actions,
			...payment.common.actions,
			...settings.common.actions,
			...startup.common.actions,
			...tenant.common.actions,
			...unit.common.actions,
			openPayments: 'open payments',
			proceed: 'proceed',
			remove: 'remove',
			restore: 'restore',
			rollback: 'rollback',
			rollingBack: 'rolling back...',
			save: 'save',
			saveDatabasePath: 'save database path',
			saveWindow: 'save window',
			saving: 'saving...',
			signIn: 'sign in',
			update: 'update',
			useDefaultPath: 'use default path',
			working: 'working...',
			...list.common.actions,
			...organization.common.actions,
			...organizationSession.common.actions,
			...palette.common.actions,
			...shell.common.actions,
			...create.common.actions
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
			appVersion: 'app version',
			complex: 'complex',
			contract: 'contract',
			contractEnds: 'contract ends',
			contractNumber: 'contract number',
			contractPeriod: 'contract period',
			currentDatabasePath: 'current database path',
			currentValue: 'current value',
			customDatabasePathOverride: 'custom database path override',
			defaultDatabasePath: 'default database path',
			dueBalance: 'due balance',
			dueBalanceCoveredToDate: 'due balance covered to date',
			information: 'information',
			name: 'name',
			nationalId: 'national ID',
			noticeWindowDays: 'notice window (days)',
			paymentFulfillment: 'payment fulfillment',
			phone: 'phone',
			remainingDueBalance: 'remaining due balance',
			status: 'status',
			tenant: 'tenant',
			units: 'units',
			...list.common.labels,
			...payment.common.labels,
			...contract.common.labels,
			...complex.common.labels,
			...unit.common.labels
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
				...organization.refusals.host,
				complexNeedsViewing:
					'adding, editing or deleting complexes needs viewing them. turn on viewing complexes first.',
				unitNeedsViewing:
					'adding, editing or deleting units needs viewing them. turn on viewing units first.',
				tenantNeedsViewing:
					'adding, editing or deleting tenants needs viewing them. turn on viewing tenants first.',
				contractNeedsViewing:
					'adding, editing or deleting contracts needs viewing them. turn on viewing contracts first.',
				paymentNeedsViewing:
					'adding, editing or deleting payments needs viewing them. turn on viewing payments first.'
			},
			payment: payment.refusals.payment,
			record: {
				idTaken: 'another record already holds that ID.',
				idTakenNamed: 'another record already holds the ID {named:string}.'
			},
			tenant: tenant.refusals.tenant,
			unit: unit.refusals.unit,
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
			// the eye at a password field's end, which shows what was typed while held (effort 851).
			showPassword: 'show password',
			sidebar: 'sidebar',
			toggleSidebar: 'toggle sidebar'
		},

		deleteDialog: {
			blockedContracts: '{count|number} {{contract still mentions|contracts still mention}} it',
			blockedDescription: 'this cannot be deleted while the following still depend on it.',
			blockedPayments: '{count|number} {{payment|payments}} recorded against it',
			blockedUnits: '{count|number} {{unit belongs|units belong}} to it',
			description: 'this cannot be undone.',
			// a record delete undo brings back: it asks first, and says so (effort 846, requirement 2).
			undoable: 'it is deleted from this workspace. you can undo this while the app is open.',
			unnamedRecord: 'this record'
		}
	},
	layout: {
		notFound: shell.layout.notFound,
		error: shell.layout.error,
		workspaceMenu: workspace.layout.workspaceMenu,
		noWorkspace: workspace.layout.noWorkspace,
		signIn: organizationSession.layout.signIn,
		startup: startup.layout.startup
	},

	dashboard: dashboard.dashboard,

	settings: settings.settings,
	complexes: complex.complexes,

	tenants: tenant.tenants,

	contracts: { ...contract.contracts, payments: payment.payments },

	print: print.print,

	settingsHooks: settings.settingsHooks,

	update: update.update,

	organization: organization.organization,

	workspace: workspace.workspace,

	earlier: workspace.earlier
} satisfies BaseTranslation;

export default en;
