import type { BaseTranslation } from '../i18n-types';

const en = {
	account: {
		groupIdentity: 'signed in as',
		password: {
			title: 'password',
			description:
				'the password that unlocks your place in the organization, on every machine you sign in from.',
			currentLabel: 'current password',
			nextLabel: 'new password',
			confirmLabel: 'new password, again',
			mismatch: 'the two do not match.',
			change: 'change password',
			changed: 'your password was changed.'
		},
		title: 'account'
	},

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
			clearSelection: 'clear selection',
			connect: 'connect',
			connecting: 'connecting...',
			copyDetails: 'copy details',
			chooseFile: 'choose a file...',
			create: 'create',
			creating: 'creating...',
			customizeColumns: 'customize columns',
			delete: 'delete',
			deleting: 'deleting...',
			disconnect: 'disconnect',
			downloadAndInstall: 'download & install',
			duplicate: 'duplicate',
			edit: 'edit',
			export: 'export',
			exportSelection: 'export selection',
			import: 'import',
			installingUpdate: 'installing update...',
			newRecord: 'new record',
			openMenu: 'open menu',
			openPayments: 'open payments',
			openPreviousRelease: 'open previous release',
			proceed: 'proceed',
			remove: 'remove',
			renew: 'renew',
			renewContract: 'renew a contract',
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
			signOut: 'sign out',
			sortBy: 'sort by',
			syncing: 'syncing...',
			syncNow: 'sync',
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
			timedOut: 'the operation took too long and stopped.'
		},

		export: {
			description: 'which file should this become?'
		},

		formats: {
			csv: 'csv',
			xlsx: 'excel workbook'
		},

		import: {
			title: 'import {record:string}',
			missingColumns:
				'this file is missing the column(s): {columns:string}. nothing can be read from it.',
			collision:
				'rows {rows:string} both claim {identity:string}. nothing will be imported until one of them goes.',
			nothingToCreate:
				'every row in this file is already here or cannot be read, so there is nothing to import.',
			willCreate: '{count|number} record(s) will be created',
			willReject: '{count|number} row(s) will be skipped',
			rejectedRow: 'row {row|number}',
			reasons: {
				duplicateOfExisting: '{detail:string} is already here',
				missingValue: 'no {detail:string}',
				invalid: '{detail:string} cannot be read',
				unresolved: 'names {detail:string}, which is not here'
			},
			incompleteColumns:
				'this file carries no {columns:string}, so no record can be created from it — only recognised as one already here.',
			skippedUnresolved: '{count|number} naming a record that is not here',
			noSheets: 'this file holds no sheet this recognises, so there is nothing to import.',
			sheetMissingColumns:
				'the {sheet:string} sheet is missing the column(s): {columns:string}. nothing can be read from this file.',
			sheetIncompleteColumns:
				'the {sheet:string} sheet carries no {columns:string}, so no record can be created from it — only recognised as one already here.',
			sheetCollision:
				'in the {sheet:string} sheet, rows {rows:string} both claim {identity:string}. nothing will be imported until one of them goes.',
			unresolvedRefused:
				'{count|number} row(s) name a record no sheet holds, so nothing in this file can be imported.',
			unresolvedRow: '{sheet:string} row {row|number} names {reference:string}',
			skippedHeld: '{count|number} already here',
			skippedIncomplete: '{count|number} missing a required value',
			skippedUnreadable: '{count|number} could not be read',
			more: 'and {count|number} more'
		},

		history: {
			// past tense, and their own words rather than undo's: an account says what happened,
			// where an undo offer names the thing it is about to take back.
			actions: {
				assigned: 'units changed',
				created: 'created',
				deleted: 'deleted',
				edited: 'edited',
				renewed: 'renewed',
				terminated: 'terminated',
				unterminated: 'restored'
			},
			emptyDescription: 'changes made to this record will be listed here.',
			emptyTitle: 'nothing has happened to this record yet.',
			title: 'history'
		},

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
			governmentId: 'government id',
			information: 'information',
			governmentIdOptional: 'government id (optional)',
			location: 'location',
			name: 'name',
			nationalId: 'national id',
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
			noResults: 'no results.',
			unexpectedError: 'unexpected error occurred!',
			unknown: 'unknown'
		},

		nav: {
			account: 'account',
			complexes: 'complexes',
			contracts: 'contracts',
			dashboard: 'dashboard',
			organization: 'organization',
			payments: 'payments',
			primary: 'primary',
			settings: 'settings',
			tenants: 'tenants',
			units: 'units',
			workspace: 'workspace'
		},

		periods: {
			'last-month': 'last month',
			'last-year': 'last year',
			'this-month': 'this month',
			'this-year': 'this year'
		},

		selection: {
			more: 'and {count|number} more',
			nothingToDo: 'none of the selected records can take this action.',
			outcomeChanged:
				'the workspace changed while this was open, so {records:string} could not be done. nothing was retried.',
			outcomeChangedCount:
				'the workspace changed while this was open, so {count|number} record(s) could not be done. nothing was retried.'
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

		table: {
			focusSearch: 'search this list',
			goToFirstPage: 'go to first page',
			goToLastPage: 'go to last page',
			goToNextPage: 'go to next page',
			goToPreviousPage: 'go to previous page',
			moveBetweenRecords: 'move between records',
			openRecord: 'open the focused record',
			pageOf: 'page {page} of {count}',
			recordsSelected: '{count|number} selected',
			results: '{count|number} result(s)',
			rowsPerPage: 'rows per page',
			rowsSelected: '{selected} of {total} row(s) selected.',
			searchPlaceholder: 'search...',
			selectRecord: 'select this record'
		},

		time: {
			day: '{count} day',
			days: '{count} days'
		},

		undo: {
			assigned: 'changing the units of {record:string}',
			created: 'creating {record:string}',
			deleted: 'deleting {record:string}',
			createdMany: 'creating {count|number} record(s)',
			deletedMany: 'deleting {count|number} record(s)',
			edited: 'editing {record:string}',
			nothingToRedo: 'nothing to apply again',
			nothingToUndo: 'nothing to take back',
			redo: 'redo',
			redone: '{change:string} applied again',
			renewed: 'renewing {record:string}',
			terminated: 'terminating {record:string}',
			terminatedMany: 'terminating {count|number} contract(s)',
			undo: 'undo',
			undone: '{change:string} undone',
			unterminated: 'restoring {record:string}',
			unterminatedMany: 'restoring {count|number} contract(s)'
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
			commandPaletteChooseRecord: 'type to find the record this runs on.',
			commandPaletteDescription: 'search for a command to run',
			commandPaletteEmpty: 'no matches found',
			commandPaletteGoTo: 'go to',
			keyboardShortcuts: 'keyboard shortcuts',
			keyboardShortcutsDescription: 'every key this application answers, wherever you are.',
			loading: 'loading',
			mobileSidebarDescription: 'displays the mobile sidebar.',
			more: 'more',
			morePages: 'more pages',
			next: 'next',
			nextSlide: 'next slide',
			pagination: 'pagination',
			previous: 'previous',
			previousSlide: 'previous slide',
			search: 'search',
			sidebar: 'sidebar',
			toggleSidebar: 'toggle sidebar'
		},

		deleteDialog: {
			blockedContracts: '{count|number} contract(s) still mention it',
			blockedDescription: 'this cannot be deleted while the following still depend on it.',
			blockedPayments: '{count|number} payment(s) recorded against it',
			blockedUnits: '{count|number} unit(s) belong to it',
			description: 'you can undo this while the app is open.',
			unnamedRecord: 'this record'
		}
	},
	layout: {
		error: {
			description:
				'something went wrong on this screen. going back to the dashboard usually clears it.',
			goHome: 'go to dashboard',
			retry: 'try again',
			shellDescription:
				'something went wrong outside this screen, so there is nothing to go back to. trying again draws the window from scratch.',
			shellTitle: 'the application could not be drawn',
			title: 'this screen could not be shown'
		},

		accountMenu: {
			label: 'account',
			signIn: 'sign-in',
			signedOutHint: 'sign-in',
			signedOutName: 'user'
		},

		workspaceMenu: {
			create: 'new workspace',
			invite: 'invite',
			locked: 'not available',
			settings: 'settings',
			members: '{count|number} member(s)',
			switchTo: 'switch to',
			open: 'open',
			inviteRefused: 'the owner or an administrator invites. ask one of them.',
			workspaceRefusedOwner: 'the owner creates a workspace. ask the owner.',
			workspaceRefusedAuthority:
				'creating a workspace needs the turso account, and this machine is not connected to it. reconnect it on the organization page.'
		},

		changePassword: {
			title: 'choose your password',
			description:
				'the password you were handed was drawn by somebody else. choose your own before going on; nothing else opens until you do.',
			handedLabel: 'the password you were handed'
		},
		noWorkspace: {
			nameLabel: 'workspace name',
			create: 'create workspace',
			creating:
				'creating the workspace on your turso account, and giving it its shape. this takes a moment.',
			created: 'the workspace was created.',
			ownerOnly:
				'an owner creates the first workspace, from the machine that connected the turso account. ask the owner.',
			title: 'no workspace yet',
			description: 'this organization holds no workspace. an owner creates the first one.'
		},

		signIn: {
			noOrganizationTitle: 'no organization on this machine yet',
			noOrganizationDescription:
				'set one up on your own turso account. everything in it stays there.',
			organizationDescription:
				'your password unlocks your place in the organization, on this machine, with or without a connection.',
			organization: 'organization',
			password: 'password',
			unlock: 'unlock',
			unlocking: 'unlocking your place in the organization. this takes a moment on purpose.',
			roleOwner: 'owner',
			roleAdministrator: 'administrator',
			roleMember: 'member',
			setUpOrganization: 'set up an organization instead',
			openInvitation: 'open an invitation link',
			title: 'Login'
		},

		startup: {
			accountChoiceEmpty: 'no workspace profiles are available yet.',
			factUpdatingTo: 'upgrading to',
			failedToStartFallback: 'failed to start the app.',
			failureDescription:
				'your workspace could not be opened. nothing recorded in it is at risk, it is kept on this machine and in your account, and starting again is the first thing to try.',
			failureTitle: 'rentable could not finish starting',
			previousVersion: 'previous version',
			recoveryDetails:
				'nothing recorded in this workspace is at risk: it is kept for you and this machine holds a copy. if startup still fails, reinstall the previous version before opening rentable again.',
			recoveryRequiredTitle: 'update recovery required',
			stageAccount: 'checking your account',
			stageChanges: 'checking for changes',
			stageRecords: 'bringing records up to date',
			migrationApplying:
				'bringing the workspace up to this version of rentable. this reaches turso and takes a moment; nothing here is stuck.',
			migrationWaiting:
				'another member is bringing the workspace up to this version of rentable. waiting on them, until {until} at the latest.',
			stageSettings: 'reading your settings',
			stageWorkspace: 'opening your workspace'
		}
	},

	dashboard: {
		empty: {
			description: 'nothing is overdue, behind on payment, or ending inside the notice window.',
			title: 'nothing needs doing today.'
		},

		figures: {
			collected: 'collected',
			occupiedUnits: 'occupied units',
			outstanding: 'outstanding'
		},

		sections: {
			alsoEnding: 'also ending',
			contractCount: '{count|number} contract(s)',
			openContract: 'open the contract for {tenant}',
			renewContract: 'renew the contract for {tenant}',
			seeAll: 'see all ({count|number})'
		},

		title: 'dashboard'
	},

	settings: {
		accountDescription:
			'this machine is signed in as the account below. signing out closes the workspace on this machine only — it stays where it is, and signing back in opens it again.',
		aboutTitle: 'about',
		createdAt: 'created {value}',

		diagnosticsDescription:
			'rentable keeps a record of what it does on this machine, so a failure can be looked into afterwards. the files never leave this machine, they are limited in size, and passwords and account tokens are removed before anything is written.',
		diagnosticsLocationLabel: 'log location',
		diagnosticsReveal: 'open log folder',

		downloadingUpdate: 'downloading update',

		endingSoonDescription:
			'a contract starts showing as ending soon on the dashboard this many days before it ends.',
		endingSoonInvalid: 'the number of days must be greater than zero',
		endingSoonTitle: 'ending soon',

		groupDiagnostics: 'diagnostics',
		groupGeneral: 'general',
		groupUpdates: 'updates',
		latestRelease: "you're already on the latest release.",

		loadErrorTitle: 'settings are unavailable right now',
		openWorkspaceAction: 'open workspace',

		transferImportTitle: 'import a workspace',
		transferImportSuccess: 'the file was imported',

		restartNotice:
			'the update has been installed. on windows the app may close automatically during installation; otherwise restart rentable to finish switching versions.',

		pathOverrideDescription:
			'leave this empty to use the default path above. saving reconnects immediately, and startup opens the selected database path.',
		pathOverridePlaceholder: 'leave empty to use the default database path',
		localeDescription: 'the interface changes as soon as you pick one.',
		localeLabel: 'display language',
		localeTitle: 'language',

		title: 'settings',

		updatesChecking: 'checking for updates...',
		updatesDescription:
			'check whether a newer version of rentable is available, and install it. if the app will not start afterwards, it offers to put back the version you were on.',

		usingCustomDatabasePath: 'the app is currently using a custom database path override.',
		usingDefaultDatabasePath: 'the app is currently using the default database path.'
	},
	complexes: {
		hooks: {
			createSuccess: 'complex created successfully!',
			deleteManySuccess: '{count|number} complex(es) deleted',
			deleteSuccess: 'complex deleted successfully!',
			unitCreateManySuccess: '{count|number} unit(s) created',
			unitCreateSuccess: 'unit created successfully!',
			unitDeleteManySuccess: '{count|number} unit(s) deleted',
			unitDeleteSuccess: 'unit deleted successfully!',
			unitUpdateSuccess: 'unit updated successfully!',
			updateSuccess: 'complex updated successfully!'
		},

		form: {
			duplicateName: 'name is associated with a previously registered complex.',
			duplicateUnitName: '{name:string} is already in the list.',
			duplicateUnitNames: 'two units share a name; each needs its own.',
			noUnitNamed: 'name at least one unit.',
			noUnitsYet: 'no units yet. add them here, or later from the complex itself.',
			unitName: 'unit name',
			unitRangeEndBeforeStart: 'the last number must not be below the first.',
			unitRangeHint: 'one name, or a run — "a 1-18" adds a 1 through a 18.',
			unitRangeTooLarge: 'a run adds at most {max:number} units at a time.'
		},

		selection: {
			deleteSummary: '{count|number} complex(es) will be deleted',
			deleteTitle: 'delete complexes',
			refusedHoldsUnits: '{count|number} still hold units',
			refusedMissing: '{count|number} are no longer in the workspace',
			unitDeleteSummary: '{count|number} unit(s) will be deleted',
			unitDeleteTitle: 'delete units',
			// every contract that ever mentioned it, not the one holding it today: a unit reading
			// as vacant on the list can still be one no deletion may touch.
			unitRefusedHoldsContracts: '{count|number} are mentioned by a contract',
			unitRefusedMissing: '{count|number} are no longer in the workspace'
		},

		units: {
			contractsEmptyDescription: 'contracts that mention this unit will appear here.',
			contractsEmptyTitle: 'no contracts mention this unit',
			duplicateName: 'name is associated with a unit in the same complex.',
			management: 'units management'
		}
	},

	tenants: {
		contracts: {
			emptyTitle: 'no contracts yet',
			emptyDescription: 'contracts this tenant holds will appear here.'
		},

		hooks: {
			createSuccess: 'tenant created successfully!',
			deleteManySuccess: '{count|number} tenant(s) deleted',
			deleteSuccess: 'tenant deleted successfully!',
			updateSuccess: 'tenant updated successfully!'
		},

		form: {
			phoneCountryCode: 'country code',
			duplicateNationalId: 'national id is associated with a registered tenant.',
			duplicatePhone: 'phone is associated with a registered tenant.',
			invalidNationalId: 'national identity number must start with 1 or 2 and be 10 digits long.',
			invalidPhone: 'phone must be valid for the selected country code {countryCode}.',
			phoneNumberPlaceholder: '5xxxxxxxx',
			phonePlaceholder: 'phone (+966...)'
		},

		selection: {
			deleteSummary: '{count|number} tenant(s) will be deleted',
			deleteTitle: 'delete tenants',
			refusedHoldsContracts: '{count|number} still hold contracts',
			refusedMissing: '{count|number} are no longer in the workspace'
		}
	},

	contracts: {
		form: {
			startDate: 'start date',
			calculatedEndDate: 'end date',
			calculatedEndDateHint:
				'updated automatically from the selected cycle, start date, and number of cycles. you can manually adjust it within {days} days before or after the suggested end date; allowed dates are highlighted in green.',
			costDecimalPlaces: 'cost can have at most two decimal places.',
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
			totalExpectedAmount: 'total expected amount',
			paymentAmountDecimalPlaces: 'payment amount can have at most two decimal places',
			paymentAmountGreaterThanZero: 'payment amount must be greater than zero',
			paymentAmountRequired: 'payment amount is required',
			paymentDateRequired: 'payment date is required',
			pickDate: 'pick a date',
			pickDateRange: 'pick a date range',
			periodMustMatchWholeCycles:
				'end date must stay within {days} days before or after the calculated {interval} cycle end date.',
			renewDescription:
				'the tenant, units, cycle and cost carry over from the contract being renewed. set the term the renewal runs for.',
			renewTitle: 'renew contract',
			renewalMustFollowOriginal: 'a renewal must start after the contract it renews ends.',
			renewalUnitsUnavailable:
				'another contract holds one or more of these units over the selected term. choose a different term.',
			searchAndSelectTenant: 'search and select tenant',
			searchTenantPlaceholder: 'search tenant by name, id or phone...',
			startDateRequired: 'start date is required.',
			tenantRequired: 'tenant is required.'
		},

		hooks: {
			createPaymentSuccess: 'payment created successfully!',
			createSuccess: 'contract created successfully!',
			deleteManyPaymentsSuccess: '{count|number} payment(s) deleted',
			deleteManySuccess: '{count|number} contract(s) deleted',
			deletePaymentSuccess: 'payment deleted successfully!',
			deleteSuccess: 'contract deleted successfully!',
			renewSuccess: 'contract renewed successfully!',
			restoreManySuccess: '{count|number} contract(s) restored',
			restoreSuccess: 'contract restored successfully!',
			terminateManySuccess: '{count|number} contract(s) terminated',
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
			monthTotal: 'total shown for {month}',
			percentFulfilled: '{percent}% fulfilled',
			remaining: '{amount} sar remaining',
			remainingAfter: 'remaining after this payment',
			remainingBalance: 'remaining balance',
			terminatedNotice:
				'terminated contracts are locked. you can review payment history here, but you cannot add, edit, or delete payments until the contract is unterminated.',
			terminatedSummary: 'this contract is terminated and locked. payment records are read-only.',
			title: 'payments',
			titleFor: 'payments for {govId}',
			trackSummary: 'track contract payments and add new payment records here.'
		},

		ranks: {
			endingSoon: 'ending soon',
			overdue: 'overdue',
			owing: 'owing'
		},

		selection: {
			deleteSummary: '{count|number} contract(s) will be deleted',
			deleteTitle: 'delete contracts',
			paymentDeleteSummary: '{count|number} payment(s) will be deleted',
			paymentDeleteTitle: 'delete payments',
			// a payment carries no rule of its own; everything that locks one is its contract's
			// state, and the ledger hides its controls there, so this is only ever reached by the
			// contract being terminated while the confirmation is open.
			paymentRefusedContractTerminated: '{count|number} belong to a terminated contract',
			paymentRefusedMissing: '{count|number} are no longer in the workspace',
			refusedHoldsPayments: '{count|number} still carry payments',
			refusedHoldsUnits: '{count|number} still hold units',
			refusedMissing: '{count|number} are no longer in the workspace',
			refusedNotRestorable: '{count|number} are not terminated',
			refusedNotTerminable: '{count|number} cannot be terminated by hand',
			restoreSummary: '{count|number} contract(s) will be restored',
			restoreTitle: 'restore contracts',
			terminateSummary: '{count|number} contract(s) will be terminated',
			terminateTitle: 'terminate contracts'
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
			available: 'available',
			assigned: 'assigned',

			transferDescription:
				'move a unit between the two sides; each move is saved as it happens. units linked to a contract whose term overlaps this one are not offered.',

			lockNoticeHasPayments:
				'contracts with registered payments are locked. you can review linked units here, but you cannot assign or remove units after payments have been recorded.',
			lockNoticeTerminated:
				'terminated contracts are locked. you can review linked units here, but you cannot assign or remove units until the contract is unterminated.',

			noAssignedUnits: 'no units are assigned to this contract yet.',
			noAvailableUnits: 'no units are available for this contract timeframe.'
		}
	},

	settingsHooks: {
		databasePathReset: 'database path reset to default successfully!',
		databasePathUpdated: 'database path updated successfully!',
		endingSoonUpdated: 'ending soon notice window updated successfully!',
		profileSwitched: 'workspace switched successfully!',
		workspaceUpToDate: 'this workspace is up to date!',
		startupRecoveryCleared: 'startup recovery cleared. retrying the current version is now allowed.'
	},

	organization: {
		setup: {
			setupTitle: 'set up an organization',
			setupDescription:
				'rentable runs on a turso account you own. your records live there, and nowhere of ours.',
			connectTitle: 'connect your turso account',
			connectDescription: 'one consent in the browser, and nothing is pasted or typed here.',
			position: 'step {step|number} of {total|number}',
			connectGroup:
				"first, create an empty group for rentable in turso's dashboard and pick it on the consent screen. the consent covers that one group and nothing else.",
			connectAccount: 'no turso account yet? make one on the consent screen.',
			connectSuccession:
				'the organization lives wherever that group does. on a personal account only you can grant rentable authority again; on a turso organization any administrator can, and turso can move a group there from its dashboard. rentable does neither for you.',
			openDashboard: 'open turso dashboard',
			connect: 'connect turso account',
			connecting: 'finish the consent in the browser window that just opened.',
			connected: 'turso account connected.',
			consentAbandoned: 'the consent was not granted. nothing was created.',
			consentFailed: 'turso refused the consent.',
			nameTitle: 'name it',
			nameDescription:
				"the organization's name, and the password that unlocks your place in it. nothing else is typed here.",
			nameLabel: 'organization name',
			nameRequired: 'give the organization a name.',
			nameTooLong: 'that name is too long.',
			passwordLabel: 'your password',
			passwordFloor:
				'use at least 12 characters. there is no server to slow a guess down, so the password is the only thing between anybody holding the records and reading them.',
			passwordTooShort: 'use at least 12 characters.',
			create: 'create organization',
			creating: 'creating the organization on your turso account...',
			workspaceTitle: 'name your first workspace',
			workspaceDescription:
				'a workspace holds one set of records. more can be added later, from inside the application.',
			linkLabel: 'join link',
			copyLink: 'copy link',
			linkCopied: 'link copied.',
			continue: 'continue',
			back: 'back'
		},
		join: {
			title: 'join an organization',
			description:
				'open the invitation you were handed: a link, and the password that came with it.',
			linkLabel: 'invitation link',
			open: 'open link',
			reading: 'reading the invitation...',
			unreadable:
				'this is not a rentable invitation link. paste the whole link, exactly as it was handed to you.',
			unreachable:
				'the organization could not be reached. the link is right; try again once the connection is back.',
			tryAgain: 'try again',
			back: 'back',
			found: 'this link finds {name}.',
			refusedLapsed:
				'the invitation has lapsed. ask whoever invited you for a new one; the link itself does not expire.',
			refusedConsumed: 'the invitation was already used. sign in with your password instead.',
			refusedRevoked: 'the invitation was revoked. ask whoever invited you for a new one.',
			restoreDescription:
				"this is the organization's own link. if you already have a place in it, your password opens it on this machine too.",
			emailLabel: 'your email',
			emailOptional:
				'the address you were invited with. the owner was invited with none and leaves this empty.',
			restore: 'restore my place',
			passwordLabel: 'the password you were handed',
			join: 'join',
			signInInstead: 'sign in instead'
		},
		dashboard: {
			members: 'members',
			invitations: 'invitations',
			workspaces: 'workspaces',
			inviteTitle: 'invite somebody',
			inviteDescription:
				'an invitation makes their place in the organization. you hand them the link and the password yourself.',
			email: 'email',
			emailInvalid: 'enter an email address.',
			nameRequired: 'give them a name.',
			role: 'role',
			administratorsAreTheOwners: 'only the owner can invite an administrator.',
			noWorkspaceToGrant: 'no workspace to grant yet. they can be granted one later.',
			invite: 'invite',
			cannotSend:
				'rentable sends nothing. copy the link and the password below and hand them to the person yourself; the password is shown once.',
			generatedPassword: 'generated password',
			passwordOnce:
				'this is the only time the password is shown. they change it on their first sign-in.',
			copyPassword: 'copy password',
			passwordCopied: 'password copied.',
			done: 'done',
			notYetSignedIn: 'not yet signed in',
			resetPassword: 'reset password',
			linkTitle: 'organization link',
			linkDescription:
				'the link that adds this organization on another machine, and the one you restore it from if this machine is lost. it carries a read-only view of the directory, so share it the way you would a password.',
			authorityTitle: 'turso account',
			authorityDescription:
				"this machine holds no authority over the organization's turso account, so it cannot create a workspace, lock anybody out or renew credentials. the authority is nowhere to restore it from; grant the consent again here, as you did on the first run.",
			authorityReconnected: 'the turso account is connected on this machine.',
			remove: 'remove',
			removeDescription:
				'they stop being renewed, so their access ends when their credential runs out, within four weeks, and nobody else is affected. what is already on their machine stays there; nothing reaches into it.',
			removeAndLockOut: 'remove and lock out',
			lockOutReading: 'reading which workspaces this touches...',
			lockOutDescription:
				'their access to {workspaces} ends at once. turso revokes per workspace and totally, so {count|number} other member(s) of those workspaces stop syncing until their application reconnects, which it does on its own. what is already on their machine stays there.',
			removed: 'the member was removed. their access ends when their credential runs out.',
			lockedOut:
				'the member was locked out. {count|number} other member(s) reconnect on their own.',
			unreachableWorkspaces:
				'you do not hold {workspaces}, so the reset could not restore it. an administrator who does can grant it again.',
			standingOpen: 'open',
			standingLapsed: 'lapsed',
			standingConsumed: 'used',
			noInvitations: 'no invitations.',
			revoke: 'revoke',
			revoked: 'the invitation was revoked.',
			noWorkspaces: 'no workspace yet.',
			accessFull: 'full access',
			accessReadOnly: 'read only'
		},
		disconnectAction: 'disconnect turso account',
		disconnectDescription:
			'this machine holds a token for the turso account your organization lives on. disconnecting forgets it here, and nothing on this machine can reach that account afterwards.',
		disconnectRevokes:
			"forgetting the token does not revoke it. what you granted stays granted until you end it yourself, on turso's own dashboard at app.turso.tech.",
		disconnectRevokesAt: 'app.turso.tech',
		disconnected: 'this machine no longer holds a token for your turso account.'
	},

	workspace: {
		groupIdentity: 'this workspace',
		groupMembers: 'members',
		groupSync: 'sync',
		groupTransfer: 'export / import',
		identityDescription: 'the picture is a placeholder, and not something that can be changed yet.',
		membersDescription:
			'one person, and only one is possible today. inviting anybody else arrives with organizations.',
		nameTooLong: 'that name is too long.',
		nameRequired: 'give this workspace a name.',
		rename: 'rename',
		renameDescription: 'what this workspace is called, on every machine signed in to it.',
		renamed: 'the workspace was renamed.',
		roleOwner: 'owner',
		syncDescription:
			'this workspace is kept for you and reaches this machine on its own. checking in now keeps it working offline for the next three days.',
		syncStatusNeedsReconnect: 'needs reconnect',
		syncStatusSynced: 'synced',
		syncStatusAccountRefused: 'account needs attention',
		syncStatusCredentialRefused: 'access needs attention',
		credentialRefused:
			"your access to this workspace was refreshed, and this machine is collecting the new credential. if it does not clear on its own, ask the organization's owner. everything here keeps working meanwhile.",
		accountRefusedMember:
			"the organization's turso account needs attention, so nothing is reaching turso for now. tell {owner}. everything here keeps working on this machine, and what you write goes out once it is seen to.",
		accountRefusedOwner:
			"turso is refusing the organization's account: {detail}. everything keeps working on this machine, and what is written goes out once the account is seen to. the place to see to it is turso's own dashboard at app.turso.tech, under the organization that holds your group.",
		accountRefusedOwnerNoDetail:
			"turso is refusing the organization's account. everything keeps working on this machine, and what is written goes out once the account is seen to. the place to see to it is turso's own dashboard at app.turso.tech, under the organization that holds your group.",
		transferDescription:
			'write everything — tenants, complexes, units, contracts and payments — to one workbook, or read one back in. records name each other by name rather than by number, so a file opens on any machine.',
		title: 'workspace'
	}
} satisfies BaseTranslation;

export default en;
