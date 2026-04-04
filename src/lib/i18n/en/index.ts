import type { BaseTranslation } from '../i18n-types';

const en = {
	app: {
		name: 'rentable'
	},

	common: {
		actions: {
			actions: 'actions',
			assignSelected: 'assign selected',
			assigning: 'assigning...',
			cancel: 'cancel',
			checkForUpdates: 'check for updates',
			checkingForUpdates: 'checking for updates...',
			create: 'create',
			createBackup: 'create backup',
			creating: 'creating...',
			creatingBackup: 'creating backup...',
			customizeColumns: 'customize columns',
			delete: 'delete',
			deleting: 'deleting...',
			dragToReorder: 'drag to reorder',
			downloadAndInstall: 'download & install',
			edit: 'edit',
			installingUpdate: 'installing update...',
			newRecord: 'new record',
			openMenu: 'open menu',
			openPayments: 'open payments',
			openPreviousRelease: 'open previous release',
			proceed: 'proceed',
			remove: 'remove',
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
			terminate: 'terminate',
			terminating: 'terminating...',
			unterminate: 'unterminate',
			update: 'update',
			useDefaultPath: 'use default path',
			working: 'working...'
		},

		labels: {
			action: 'action',
			amount: 'amount',
			appVersion: 'app version',
			availableVersion: 'available version',
			backupCount: 'backup count',
			complex: 'complex',
			contractEnds: 'contract ends',
			contractPeriod: 'contract period',
			costPerPayment: 'cost per payment',
			currentDatabasePath: 'current database path',
			currentValue: 'current value',
			currentVersion: 'current version',
			customDatabasePathOverride: 'custom database path override',
			cycle: 'cycle',
			defaultDatabasePath: 'default database path',
			dueBalance: 'due balance',
			dueBalanceCoveredToDate: 'due balance covered to date',
			end: 'end',
			governmentId: 'government id',
			information: 'information',
			governmentIdOptional: 'government id (optional)',
			lastBackupTime: 'last backup time',
			lastSyncTime: 'last sync time',
			location: 'location',
			name: 'name',
			nationalId: 'national id',
			noticeWindowDays: 'notice window (days)',
			payment: 'payment',
			paymentDate: 'payment date',
			paymentFulfillment: 'payment fulfillment',
			phone: 'phone',
			releaseDate: 'release date',
			releaseNotes: 'release notes',
			remainingDueBalance: 'remaining due balance',
			start: 'start',
			status: 'status',
			tenant: 'tenant',
			unit: 'unit',
			units: 'units'
		},

		messages: {
			loadingApp: 'loading app...',
			loadingComplexes: 'loading complexes...',
			loadingDashboard: 'loading dashboard...',
			loadingSettings: 'loading settings...',
			never: 'never',
			noResults: 'no results.',
			sar: 'sar',
			unexpectedError: 'unexpected error occurred!',
			unknown: 'unknown'
		},

		nav: {
			complexes: 'complexes',
			contracts: 'contracts',
			dashboard: 'dashboard',
			payments: 'payments',
			primary: 'primary',
			settings: 'settings',
			tenants: 'tenants',
			units: 'units'
		},

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

		table: {
			goToFirstPage: 'go to first page',
			goToLastPage: 'go to last page',
			goToNextPage: 'go to next page',
			goToPreviousPage: 'go to previous page',
			pageOf: 'page {page} of {count}',
			rowsPerPage: 'rows per page',
			rowsSelected: '{selected} of {total} row(s) selected.',
			searchPlaceholder: 'search...'
		},

		time: {
			day: '{count} day',
			days: '{count} days'
		},

		window: {
			close: 'close window',
			minimize: 'minimize window',
			toggleMaximize: 'toggle maximize window'
		},

		ui: {
			breadcrumb: 'breadcrumb',
			close: 'close',
			commandPalette: 'command palette',
			commandPaletteDescription: 'search for a command to run',
			loading: 'loading',
			mobileSidebarDescription: 'displays the mobile sidebar.',
			more: 'more',
			morePages: 'more pages',
			next: 'next',
			nextSlide: 'next slide',
			pagination: 'pagination',
			previous: 'previous',
			previousSlide: 'previous slide',
			sidebar: 'sidebar',
			toggleSidebar: 'toggle sidebar'
		},

		deleteDialog: {
			description: 'are you sure you want to delete this record(s)?',
			title: 'confirmation'
		}
	},
	layout: {
		startup: {
			failedToStartDescription:
				'there was a problem connecting the database or running startup sync.',
			failedToStartFallback: 'failed to start the app.',
			failedToStartTitle: 'failed to start the app',
			previousVersion: 'previous version',
			recoveryDescription:
				'rentable detected update recovery while starting v{version}. retry startup, or open the previous release if you need to reinstall it.',
			recoveryDetails:
				'the protected backup was created from v{backupVersion}. if startup still fails, reinstall the previous release before opening rentable again.',
			recoveryRequiredTitle: 'update recovery required',
			recoverySnapshotNotUpdated: 'rollback completed but the recovery snapshot was not updated.',
			restoredBackup: 'restored backup',
			rolledBackDescription:
				'the protected database backup has been restored and the app is locked until you reinstall the previous release.',
			rolledBackDetails:
				'open the previous github release, reinstall it, then launch rentable again.',
			rolledBackTitle: 'update rolled back',
			startupRecoveryBackup: 'backup'
		}
	},

	dashboard: {
		description:
			'track contract health, collection progress, and occupancy after each synchronization.',

		endingSoon: {
			countOne: '{count} contract ending soon',
			countOther: '{count} contracts ending soon',
			description:
				'active and fulfilled contracts that end within the configured {noticeWindow} notice window.',
			empty: 'no contracts are ending soon right now.',
			title: 'contracts ending soon'
		},

		followUps: {
			countOne: '{count} open follow-up',
			countOther: '{count} open follow-ups',
			description:
				'contracts with dues scheduled by today in the current month, or overdue defaulted balances that still need attention.',
			empty: 'no payment follow-up is needed right now.',
			progressSummary: '{percent}% of the due balance covered to date',
			remaining: '{amount} sar remaining',
			title: 'payments requiring follow-up in {monthLabel}',
			unavailable: 'dashboard data is unavailable right now.'
		},

		lastSynchronized: 'last synchronized {value}',

		sections: {
			contracts: {
				description:
					'portfolio contract status, including contracts ending within the configured {noticeWindow} notice window.',
				heroHint: '{active} active • {endingSoon} ending within {noticeWindow}',
				heroLabel: 'current portfolio size',
				title: 'contracts'
			},

			money: {
				description:
					'scheduled dues for {monthLabel}, payments collected this month, and overall contract balances.',
				heroHint: '{rate}% of the due for {monthLabel} is covered',
				heroLabel: 'outstanding now',
				title: 'money'
			},

			occupancy: {
				description: 'stored unit occupancy after dashboard synchronization.',
				heroHint: '{occupied} occupied out of {total} units',
				heroLabel: 'occupancy rate',
				title: 'occupancy'
			}
		},

		stats: {
			activeEndingWithin: '{active} active • {endingSoon} ending within {noticeWindow}',
			dueThisMonth: 'due this month',
			occupancyRate: 'occupancy rate',
			overallCollectionRate: 'overall collection rate',
			occupiedUnits: 'occupied units',
			receivedThisMonth: 'received this month',
			stillDueThisMonth: 'still due this month',
			totalExpectedAmount: 'total expected amount',
			totalUnits: 'total units',
			vacancyRate: 'vacancy rate',
			vacantUnits: 'vacant units'
		},

		title: 'dashboard'
	},

	settings: {
		aboutDescription: 'current app details and the latest synchronization and backup timestamps.',
		aboutTitle: 'about',
		createdAt: 'created {value}',

		createBackupDescription:
			'backups are stored in the app backup directory and can be restored below. protected update backups are created automatically before migrations run.',
		createBackupTitle: 'create backup',

		databaseDescription:
			'switch the active database, fall back to the default path, create backups, and restore earlier backups.',
		databaseTitle: 'database path and backups',

		deleteBackupDescription: 'are you sure you want to delete this backup? this cannot be undone.',
		deleteBackupNamedDescription:
			'are you sure you want to delete "{name}"? this cannot be undone.',
		deleteBackupTitle: 'delete backup',

		description:
			'manage the ending-soon notice window, app updates, database paths, backups, and app details.',

		downloadingUpdate: 'downloading update',

		endingSoonDescription:
			'choose how many days before contract end a contract should appear as ending soon on the dashboard.',
		endingSoonInvalid: 'ending soon notice window must be greater than zero',
		endingSoonTitle: 'ending soon notice window',

		latestRelease: "you're already on the latest release.",

		loadErrorDescription: 'there was a problem loading the current settings snapshot.',
		loadErrorTitle: 'settings are unavailable right now',

		protectedUpdateBackup: 'protected update backup',
		releaseAvailable: 'update v{version} is available.',
		restoreBackupTitle: 'restore backup',

		restartNotice:
			'the update has been installed. on windows the app may close automatically during installation; otherwise restart rentable to finish switching versions.',

		noBackups: 'no backups are available yet.',

		pathOverrideDescription:
			'leave this empty to use the default path above. saving reconnects immediately, and startup reruns migrations on the selected database path.',
		pathOverridePlaceholder: 'leave empty to use the default database path',

		localeDescription: 'choose your preferred display language. the interface updates immediately.',
		localeLabel: 'display language',
		localeTitle: 'language',

		title: 'settings',

		updatesChecking: 'checking for updates...',
		updatesDescription:
			'check github releases for a newer signed build. if startup later fails after an update, rentable offers rollback to the protected pre-update backup.',
		updatesTitle: 'app updates',

		usingCustomDatabasePath: 'the app is currently using a custom database path override.',
		usingDefaultDatabasePath: 'the app is currently using the default database path.'
	},
	complexes: {
		hooks: {
			createSuccess: 'complex created successfully!',
			deleteSuccess: 'complex deleted successfully!',
			unitCreateSuccess: 'unit created successfully!',
			unitDeleteSuccess: 'unit deleted successfully!',
			unitUpdateSuccess: 'unit updated successfully!',
			updateSuccess: 'complex updated successfully!'
		},

		form: {
			duplicateName: 'name is associated with a previously registered complex.'
		},

		units: {
			duplicateName: 'name is associated with a unit in the same complex.',
			management: 'units management'
		}
	},

	tenants: {
		hooks: {
			createSuccess: 'tenant created successfully!',
			deleteSuccess: 'tenant deleted successfully!',
			updateSuccess: 'tenant updated successfully!'
		},

		form: {
			phoneCountryCode: 'country code',
			duplicateNationalId: 'national id is associated with a registered tenant.',
			duplicatePhone: 'phone is associated with a registered tenant.',
			invalidNationalId: 'iqama must start with 1 or 2 and be 10 digits long.',
			invalidPhone: 'phone must be valid for the selected country code {countryCode}.',
			phoneNumberPlaceholder: '5xxxxxxxx',
			phonePlaceholder: 'phone (+966...)'
		}
	},

	contracts: {
		form: {
			startDate: 'start date',
			calculatedEndDate: 'end date',
			calculatedEndDateHint:
				'updated automatically from the selected cycle, start date, and number of cycles. you can manually adjust it within {days} days before or after the suggested end date; allowed dates are highlighted in green.',
			costGreaterThanZero: 'cost must be greater than zero.',
			costPerPaymentGreaterThanZero: 'cost per payment must be greater than zero.',
			costRequired: 'cost is required.',
			cyclesGreaterThanZero: 'number of cycles must be greater than zero.',
			cyclesRequired: 'number of cycles is required.',
			duplicateGovernmentId: 'government id is associated with another contract.',
			endDateAfterStart: 'end date must be after start date.',
			endDateRequired: 'end date is required.',
			endDateShort: 'end date',
			invalidTenant: 'please select a valid tenant.',
			loadingTenant: 'loading tenant...',
			loadingTenants: 'loading tenants...',
			noTenantFound: 'no tenant found.',
			numberOfCycles: 'number of cycles',
			paymentAmountGreaterThanZero: 'payment amount must be greater than zero',
			paymentAmountRequired: 'payment amount is required',
			paymentDateRequired: 'payment date is required',
			pickDate: 'pick a date',
			pickDateRange: 'pick a date range',
			periodMustMatchWholeCycles:
				'end date must stay within {days} days before or after the calculated {interval} cycle end date.',
			searchAndSelectTenant: 'search and select tenant',
			searchTenantPlaceholder: 'search tenant by name, id or phone...',
			startDateRequired: 'start date is required.',
			startTypingTenantSearch: 'start typing to search tenants by name, id or phone.',
			tenantRequired: 'tenant is required.'
		},

		hooks: {
			assignUnitsSuccess: 'units added to contract successfully!',
			createPaymentSuccess: 'payment created successfully!',
			createSuccess: 'contract created successfully!',
			deletePaymentSuccess: 'payment deleted successfully!',
			deleteSuccess: 'contract deleted successfully!',
			removeUnitSuccess: 'unit removed from contract successfully!',
			restoreSuccess: 'contract restored successfully!',
			terminateSuccess: 'contract terminated successfully!',
			updatePaymentSuccess: 'payment updated successfully!',
			updateSuccess: 'contract updated successfully!'
		},

		intervals: {
			annual: 'annual',
			monthly: 'monthly',
			quarterly: 'quarterly',
			semiAnnual: 'semi-annual'
		},

		payments: {
			fullyPaidNotice:
				'this contract has already reached its required total payment amount. you can still edit or delete payments if needed, but you cannot add more until the paid total drops below the required amount.',
			fullyPaidSummary:
				'this contract has been fully paid. you can edit or delete payments, but you cannot add more.',
			percentFulfilled: '{percent}% fulfilled',
			remaining: '{amount} sar remaining',
			terminatedNotice:
				'terminated contracts are locked. you can review payment history here, but you cannot add, edit, or delete payments until the contract is unterminated.',
			terminatedSummary: 'this contract is terminated and locked. payment records are read-only.',
			title: 'payments',
			titleFor: 'payments for {govId}',
			trackSummary: 'track contract payments and add new payment records here.'
		},

		statusDescriptions: {
			active: 'active; payments on track',
			defaulted: 'ended; not paid in full',
			expired: 'ended; paid in full',
			fulfilled: 'active; paid in full',
			scheduled: 'scheduled; starts in the future',
			terminated: 'manually terminated; locked for changes'
		},

		table: {
			paymentsManagement: 'payments management',
			restoreDescription:
				'are you sure you want to remove the manual termination from this contract?',
			restoreTitle: 'restore contract',
			terminateDescription:
				'are you sure you want to manually terminate this contract? this only works for active or past contracts.',
			terminateTitle: 'terminate contract',
			tenantFallback: 'tenant #{tenantId}',
			unitsManagement: 'units management'
		},

		units: {
			assignedDescriptionEditable:
				'remove a unit from this contract when it should no longer be linked to it.',
			assignedDescriptionLocked: 'review the units currently linked to this contract.',
			assignedTitle: 'assigned units',

			availableDescription:
				'choose a complex to show units that are available for this contract timeframe. units linked to overlapping contracts are excluded.',
			availableTitle: 'available units',

			loadingContract: 'loading contract...',

			lockNoticeHasPayments:
				'contracts with registered payments are locked. you can review linked units here, but you cannot assign or remove units after payments have been recorded.',
			lockNoticeTerminated:
				'terminated contracts are locked. you can review linked units here, but you cannot assign or remove units until the contract is unterminated.',

			lockSummaryDefault:
				'assign available units by complex, then manage the units already linked to this contract.',
			lockSummaryHasPayments: 'this contract has registered payments. unit assignments are locked.',
			lockSummaryTerminated:
				'this contract is terminated and locked. unit assignments are read-only.',

			noAssignedUnits: 'no units are assigned to this contract yet.',
			noAvailableUnits:
				'no units are available for this contract timeframe in the selected complex.',

			selectComplex: 'select a complex to load available units.',
			selectComplexPlaceholder: 'select complex',

			unitsFor: 'units for {govId}',
			unitsTitle: 'units'
		}
	},

	settingsHooks: {
		backupCreated: 'backup created successfully!',
		backupDeleted: 'backup deleted successfully!',
		backupRestored: 'backup restored successfully!',
		databasePathReset: 'database path reset to default successfully!',
		databasePathUpdated: 'database path updated successfully!',
		endingSoonUpdated: 'ending soon notice window updated successfully!',
		rollbackRestored: 'protected update backup restored successfully!',
		startupRecoveryCleared: 'startup recovery cleared. retrying the current version is now allowed.'
	}
} satisfies BaseTranslation;

export default en;
