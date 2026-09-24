import type { BaseTranslation } from '../i18n-types';

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

		export: {
			description: 'which file should this become?'
		},

		formats: {
			csv: 'csv',
			xlsx: 'excel workbook'
		},

		import: {
			title: 'import {record:string}',
			missingColumns: 'this file has no {columns:string}, so nothing can be read from it.',
			collision:
				'rows {rows:string} both claim {identity:string}. nothing will be imported until one of them goes.',
			nothingToCreate:
				'every row in this file is already here or cannot be read, so there is nothing to import.',
			willCreate: '{count|number} {{record|records}} will be created',
			willReject: '{count|number} {{row|rows}} will be skipped',
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
				'the {sheet:string} sheet has no {columns:string}, so nothing can be read from this file.',
			sheetIncompleteColumns:
				'the {sheet:string} sheet has no {columns:string}, so its rows can only match records already here.',
			sheetCollision:
				'rows {rows:string} of the {sheet:string} sheet both claim {identity:string}. remove one to import.',
			unresolvedRefused:
				'{count|number} {{row names|rows name}} a record no sheet holds, so nothing in this file can be imported.',
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

		periods: {
			'last-month': 'last month',
			'last-year': 'last year',
			'this-month': 'this month',
			'this-year': 'this year'
		},

		// what a procedure's refusal says, by the code it was raised with (`$lib/api/refusal`). A
		// refusal crosses as a code and its values, and this is the only place it becomes words.
		refusals: {
			complex: {
				gone: 'this complex is no longer in the workspace. reload to see what changed.',
				holdsUnits: 'this complex still holds units. delete them before deleting it.',
				nameTaken: 'name is associated with a previously registered complex.',
				nameTakenNamed:
					'the name {named:string} is associated with a previously registered complex.',
				repeatedInSet: 'two complexes in this set claim {value:string}.'
			},
			contract: {
				costNotPositive: 'cost per payment must be greater than zero.',
				endBeforeStart: 'end date must be after start date.',
				govIdTaken: 'government ID is associated with another contract.',
				govIdTakenNamed: 'government ID {named:string} is associated with another contract.',
				holdsPayments: 'this contract has payments. delete them before deleting it.',
				holdsUnits: 'this contract still holds units. remove them before deleting it.',
				missing: 'this contract is no longer in the workspace. reload to see what changed.',
				notTerminable: 'only an active, fulfilled or past contract can be terminated.',
				notUnterminable: 'only a terminated contract can be restored.',
				paidInFull: 'this contract is paid in full and takes no more payments.',
				periodOffCycle:
					'end date must stay within {days:number} days before or after the calculated {interval:string} cycle end date.',
				periodOverlapsUnits:
					'another contract holds one or more of these units over the new dates. choose different dates.',
				renewalBeforeEnd: 'a renewal must start after the contract it renews ends.',
				repeatedInSet: 'two contracts in this set claim {value:string}.',
				tenantMissing: 'the selected tenant is no longer in the workspace. choose another.',
				tenantMissingNamed: 'no tenant with the ID {named:string} is in the workspace.',
				terminatedLocked: 'this contract is terminated and locked. restore it before changing it.',
				unitsLockedByPayments:
					'the units of a contract cannot change once payments are registered against it.',
				unitsMissing:
					'one or more of these units are no longer in the workspace. reload to see what changed.',
				unitsTaken:
					'another contract holds one or more of the chosen units over this term. choose other units or a different term.',
				unitsUnavailable:
					'another contract holds one or more of these units over the selected term. choose a different term.'
			},
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
				roleUnknown: 'choose administrator or member.',
				memberMissing: 'that member is no longer in this organization. reload to see what changed.',
				memberGone: 'this account is no longer in the organization.',
				memberRemoved:
					'that member was removed. make them an account again if they are to come back.',
				notYourself: 'you cannot do this to your own account. another administrator can.',
				ownerProtected: "the owner's account is not changed this way. the organization is theirs.",
				ownerOnly: 'only the owner can do this. ask the owner.',
				ownerMachineOnly:
					"this needs the turso account, which is connected on the owner's machine. ask the owner.",
				roleLacksAct: 'your role does not include this. ask an administrator.',
				notAdministrator: 'only an administrator can do this.',
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
				tursoNotConnected:
					'this machine is not connected to the turso account. connect it and try again.',
				consentNeededAgain:
					'turso needs the consent granted again. connect the turso account again.',
				consentGone: 'this consent is no longer waiting. start it again.',
				groupMismatch:
					'that is not the group the consent was given over. check the name and try again.',
				groupNeeded: 'turso needs the name of the group you picked. type it below.',
				groupHoldsOrganization:
					'that group already holds an organization. pick another group or another turso account.',
				groupEmpty:
					'the consent was given over a group that holds no organization. give it over the group that holds yours.',
				nothingToConnectTo:
					'this turso account holds no organization to connect to. go back and make one.',
				createRefused: "turso would not create the organization's database.",
				tursoRefused: 'turso refused the request. trying again will not help.',
				tursoAccountRefused:
					"turso refused the request because of the account itself. check the account's plan in turso."
			},
			payment: {
				amountNotPositive: 'payment amount must be greater than zero.',
				datedInFuture: 'a payment cannot be dated in the future.',
				missing: 'this payment is no longer in the workspace. reload to see what changed.',
				repeatedInSet: 'two payments in this set claim {value:string}.'
			},
			record: {
				idTaken: 'another record already holds that ID.',
				idTakenNamed: 'another record already holds the ID {named:string}.'
			},
			tenant: {
				gone: 'this tenant is no longer in the workspace. reload to see what changed.',
				holdsContracts: 'contracts mention this tenant, so it cannot be deleted.',
				nationalIdTaken: 'national ID is associated with a registered tenant.',
				nationalIdTakenNamed: 'national ID {named:string} is associated with a registered tenant.',
				phoneTaken: 'phone is associated with a registered tenant.',
				phoneTakenNamed: 'phone {named:string} is associated with a registered tenant.',
				repeatedInSet: 'two tenants in this set claim {value:string}.'
			},
			unit: {
				gone: 'this unit is no longer in the workspace. reload to see what changed.',
				holdsContracts: 'a contract mentions this unit, so it cannot be deleted.',
				nameRepeated: '{name:string} is used twice; each unit needs its own name.',
				nameTaken: 'name is associated with a unit in the same complex.',
				nameTakenNamed: 'the name {named:string} is associated with a unit in the same complex.',
				repeatedInSet: 'two units in this set claim {value:string}.'
			},
			workspace: {
				nothingToImport: 'there is nothing to import.',
				unknownComplex: 'the file names a complex called {name:string}, and there is none.',
				unknownContract: 'the file names a contract called {name:string}, and there is none.',
				unknownTenant: 'the file names a tenant called {name:string}, and there is none.',
				unknownUnit: 'the file names a unit called {name:string}, and there is none.'
			}
		},

		selection: {
			more: 'and {count|number} more',
			nothingToDo: 'none of the selected records can take this action.',
			outcomeChanged:
				'the workspace changed while this was open, so {records:string} could not be done. nothing was retried.',
			outcomeChangedCount:
				'the workspace changed while this was open, so {count|number} {{record|records}} could not be done. nothing was retried.'
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
			results: '{count|number} {{result|results}}',
			rowsPerPage: 'rows per page',
			rowsSelected: '{selected} of {total} {{row|rows}} selected.',
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
			createdMany: 'creating {count|number} {{record|records}}',
			deletedMany: 'deleting {count|number} {{record|records}}',
			edited: 'editing {record:string}',
			lasts: 'you can undo this while the app is open.',
			nothingToRedo: 'nothing to apply again',
			nothingToUndo: 'nothing to take back',
			redo: 'redo',
			redone: '{change:string} applied again',
			renewed: 'renewing {record:string}',
			terminated: 'terminating {record:string}',
			terminatedMany: 'terminating {count|number} {{contract|contracts}}',
			undo: 'undo',
			undone: '{change:string} undone',
			unterminated: 'restoring {record:string}',
			unterminatedMany: 'restoring {count|number} {{contract|contracts}}'
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
			commandPaletteActDoesNotApply: '{act} does not apply to {record}.',
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
			nothingToCreateHere: 'nothing on this screen takes a new record',
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
		notFound: {
			description: 'the link that led here may be out of date.',
			title: 'this page does not exist'
		},

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
			signedOutHint: 'not signed in',
			signedOutName: 'user'
		},

		workspaceMenu: {
			create: 'new workspace',
			locked: 'not available',
			members: '{count|number} {{member|members}}',
			switchTo: 'switch to',
			open: 'open',
			workspaceRefusedAuthority:
				'creating a workspace needs the turso account. reconnect it in settings, under organization.'
		},

		noWorkspace: {
			nameLabel: 'workspace name',
			create: 'create workspace',
			creating: 'creating the workspace on your turso account. this takes a moment.',
			created: 'the workspace was created.',
			ownerOnly:
				'only the owner can create the first workspace, from the machine that connected the turso account.',
			title: 'no workspace yet',
			description:
				'your organization has no workspace yet. create the first one to start keeping records.'
		},

		signIn: {
			noOrganizationTitle: 'welcome',
			noOrganizationSubtitle: 'no organization on this machine yet.',
			subtitle: 'sign in to continue',
			help: 'trouble signing in?',
			username: 'username',
			password: 'password',
			unlocking: 'signing you in. this takes a moment on purpose.',
			roleOwner: 'owner',
			roleAdministrator: 'administrator',
			roleMember: 'member',
			setUp: 'use your turso account',
			setUpDescription: 'you own the organization.',
			connectByLink: 'use a link and code',
			connectByLinkDescription: 'you were given a link and a code.',
			signedOutElsewhere:
				'you were signed out of this machine from another one. sign in again to carry on.',
			useALink: 'use a link',
			disconnect: 'disconnect this machine',
			disconnectDescription:
				'this machine deletes its copy of the organization and its workspaces, and forgets the turso account. nothing on turso changes. the owner connects again with their turso account; anyone else needs a new link.'
		},

		startup: {
			factUpdatingTo: 'upgrading to',
			failedToStartFallback: 'failed to start the app.',
			failureDescription:
				'your workspace could not be opened. nothing in it is at risk; try starting again.',
			failureTitle: 'rentable could not finish starting',
			previousVersion: 'previous version',
			recoveryDetails:
				'nothing in this workspace is at risk; this machine holds a copy. if startup still fails, reinstall the previous version.',
			recoveryRequiredTitle: 'update recovery required',
			stageAccount: 'checking your account',
			stageChanges: 'checking for changes',
			stageRecords: 'bringing records up to date',
			migrationApplying:
				'bringing the workspace up to this version of rentable. this reaches turso and takes a moment; nothing here is stuck.',
			migrationWaiting:
				'another member is bringing the workspace up to this version of rentable. waiting on them, until {until} at the latest.',
			stagePrepare: 'creating your first workspace',
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
			contractCount: '{count|number} {{contract|contracts}}',
			openContract: 'open the contract for {tenant}',
			seeAll: 'see all ({count|number})'
		},

		title: 'dashboard'
	},

	settings: {
		diagnosticsDescription:
			'a record of what rentable does, for looking into failures. it stays here, and passwords and tokens are left out.',
		diagnosticsReveal: 'open log folder',
		diagnosticsTitle: 'diagnostics',

		downloadingUpdate: 'downloading update',

		endingSoonDescription:
			'a contract starts showing as ending soon on the dashboard this many days before it ends.',
		endingSoonInvalid: 'the number of days must be greater than zero',
		endingSoonTitle: 'ending soon',

		latestRelease: "you're already on the latest release.",

		loadErrorTitle: 'settings are unavailable right now',

		transferImportTitle: 'import a workspace',
		transferImportSuccess: 'the file was imported',

		restartNotice: 'update installed. restart rentable to finish.',

		localeDescription: 'the interface changes as soon as you pick one.',
		localeTitle: 'language',

		appearanceTitle: 'appearance',
		appearanceDescription: 'light or dark, or follow your system as it changes.',
		appearance: {
			system: 'system',
			light: 'light',
			dark: 'dark'
		},

		// the four sections of the settings area, each named for what it holds and in the order the
		// rail draws them rather than in alphabetical order: the order is read here as a list.
		section: {
			general: 'general',
			account: 'account',
			organization: 'organization',
			workspaces: 'workspaces'
		},

		title: 'settings',

		updatesChecking: 'checking for updates...',
		updatesDescription:
			'check for a newer version and install it. if the app then fails to start, it offers the version you were on.',
		updatesTitle: 'updates',

		you: {
			signedInAs: 'signed in as',
			password: {
				title: 'password',
				description: 'the password you sign in with, on every machine.',
				currentLabel: 'current password',
				nextLabel: 'new password',
				confirmLabel: 'new password, again',
				mismatch: 'the two do not match.',
				change: 'change password',
				changed: 'your password was changed.'
			},
			sessions: {
				title: 'other machines',
				description: 'sign out everywhere but here. your password stays the same.',
				action: 'sign out of other machines',
				confirmDescription:
					'every other machine signed in as you is signed out. this one stays signed in, and your password does not change.',
				ended: 'your other machines were signed out.',
				endedPending:
					'this machine is offline; the sign-out reaches the others once it is back online.'
			},
			// requirement 22: drawn for the one person an offer stands with, and absent for
			// everybody else. One sentence naming who offered it, and the act.
			ownership: {
				title: 'ownership',
				offered:
					'{owner:string} has offered you this organization. accepting makes you the owner and makes them an administrator.'
			}
		}
	},
	complexes: {
		empty: {
			description: 'complexes you add, with their units, will be listed here.',
			title: 'no complexes yet'
		},

		hooks: {
			createSuccess: 'complex created successfully!',
			deleteManySuccess: '{count|number} complex(es) deleted',
			deleteSuccess: 'complex deleted successfully!',
			unitCreateManySuccess: '{count|number} {{unit|units}} created',
			unitCreateSuccess: 'unit created successfully!',
			unitDeleteManySuccess: '{count|number} {{unit|units}} deleted',
			unitDeleteSuccess: 'unit deleted successfully!',
			unitUpdateSuccess: 'unit updated successfully!',
			updateSuccess: 'complex updated successfully!'
		},

		form: {
			duplicateUnitName: '{name:string} is already in the list.',
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
			unitDeleteSummary: '{count|number} {{unit|units}} will be deleted',
			unitDeleteTitle: 'delete units',
			// every contract that ever mentioned it, not the one holding it today: a unit reading
			// as vacant on the list can still be one no deletion may touch.
			unitRefusedHoldsContracts: '{count|number} are mentioned by a contract',
			unitRefusedMissing: '{count|number} are no longer in the workspace'
		},

		units: {
			contractsEmptyDescription: 'contracts that mention this unit will appear here.',
			contractsEmptyTitle: 'no contracts mention this unit',
			emptyDescription: 'units you add to this complex will be listed here.',
			emptyTitle: 'no units in this complex yet',
			management: 'units management'
		}
	},

	tenants: {
		empty: {
			description: 'tenants you add will be listed here.',
			title: 'no tenants yet'
		},

		contracts: {
			emptyTitle: 'no contracts yet',
			emptyDescription: 'contracts this tenant holds will appear here.'
		},

		hooks: {
			createSuccess: 'tenant created successfully!',
			deleteManySuccess: '{count|number} {{tenant|tenants}} deleted',
			deleteSuccess: 'tenant deleted successfully!',
			updateSuccess: 'tenant updated successfully!'
		},

		form: {
			phoneCountryCode: 'country code',
			invalidNationalId: 'national identity number must start with 1 or 2 and be 10 digits long.',
			invalidPhone: 'phone must be valid for the selected country code {countryCode}.',
			phoneNumberPlaceholder: '5xxxxxxxx',
			phonePlaceholder: 'phone (+966...)'
		},

		selection: {
			deleteSummary: '{count|number} {{tenant|tenants}} will be deleted',
			deleteTitle: 'delete tenants',
			refusedHoldsContracts: '{count|number} still hold contracts',
			refusedMissing: '{count|number} are no longer in the workspace'
		}
	},

	contracts: {
		empty: {
			description: 'contracts you create will be listed here, those needing attention first.',
			title: 'no contracts yet'
		},

		form: {
			startDate: 'start date',
			calculatedEndDate: 'end date',
			calculatedEndDateHint:
				'follows the cycle, start date and number of cycles. move it up to {days} days either way; allowed dates are green.',
			costDecimalPlaces: 'cost can have at most two decimal places.',
			costGreaterThanZero: 'cost must be greater than zero.',
			costRequired: 'cost is required.',
			cyclesGreaterThanZero: 'number of cycles must be greater than zero.',
			cyclesRequired: 'number of cycles is required.',
			endDateRequired: 'end date is required.',
			endDateShort: 'end date',
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
			searchAndSelectTenant: 'search and select tenant',
			searchTenantPlaceholder: 'search tenant by name, ID or phone...',
			startDateRequired: 'start date is required.',
			tenantRequired: 'tenant is required.',
			chooseUnits: 'choose units',
			loadingUnits: 'loading units...',
			noUnitFree: 'no unit is free over this term.',
			searchUnitPlaceholder: 'search units by name or complex...',
			unitHeldOverTerm: 'held by another contract over this term',
			unitsHint:
				"only units free over the contract's term are offered. you can change them later on the contract's units tab.",
			unitsNeedTerm: 'pick the start date first; the units free over the term are offered then.',
			unitsOptional: 'units (optional)'
		},

		hooks: {
			createPaymentSuccess: 'payment created successfully!',
			createSuccess: 'contract created successfully!',
			deleteManyPaymentsSuccess: '{count|number} {{payment|payments}} deleted',
			deleteManySuccess: '{count|number} {{contract|contracts}} deleted',
			deletePaymentSuccess: 'payment deleted successfully!',
			deleteSuccess: 'contract deleted successfully!',
			renewSuccess: 'contract renewed successfully!',
			restoreManySuccess: '{count|number} {{contract|contracts}} restored',
			restoreSuccess: 'contract restored successfully!',
			terminateManySuccess: '{count|number} {{contract|contracts}} terminated',
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
			emptyTitle: 'no payments yet',
			fullyPaidNotice: 'this contract is paid in full',
			fullyPaidSummary:
				'this contract has been fully paid. you can edit or delete payments, but you cannot add more.',
			monthTotal: 'total shown for {month}',
			percentFulfilled: '{percent}% fulfilled',
			remaining: '{amount:string} remaining',
			remainingAfter: 'remaining after this payment',
			remainingBalance: 'remaining balance',
			terminatedNotice: 'this contract is terminated',
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
			deleteSummary: '{count|number} {{contract|contracts}} will be deleted',
			deleteTitle: 'delete contracts',
			paymentDeleteSummary: '{count|number} {{payment|payments}} will be deleted',
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
			restoreSummary: '{count|number} {{contract|contracts}} will be restored',
			restoreTitle: 'restore contracts',
			terminateSummary: '{count|number} {{contract|contracts}} will be terminated',
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
				'move a unit between the two sides; each move saves at once. units under an overlapping contract are not shown.',

			lockNoticeHasPayments: 'this contract has payments, so its units are locked.',
			lockNoticeTerminated: 'this contract is terminated, so its units are locked.',

			noAssignedUnits: 'no units are assigned to this contract yet.',
			noAvailableUnits: 'no units are available for this contract timeframe.'
		}
	},

	settingsHooks: {
		endingSoonUpdated: 'ending soon notice window updated successfully!',
		workspaceUpToDate: 'everything is up to date.'
	},

	organization: {
		setup: {
			connectTitle: 'connect your turso account',
			connectDescription: 'your organization lives on your own turso account.',
			connectDetails: 'before you connect',
			position: 'step {step|number} of {total|number}',
			groupCoverage:
				'the consent covers every database in the group you choose, and nothing outside it.',
			oneOrganization:
				'a group holds one organization. a group that already holds one is connected to, not refused.',
			accountCreation:
				'a free or developer turso account holds one group, so keep one for rentable alone. on a paid one, pick an empty group.',
			succession:
				"only you, or a turso organization's admin, can grant access again, and turso can move a group. rentable does neither.",
			groupAskedOnce:
				'a group holding nothing yet is asked its name once, on the next step; turso names it nowhere.',
			openDashboard: 'open turso dashboard',
			connect: 'connect turso account',
			connecting: 'finish the consent in the browser window that just opened.',
			connected: 'turso account connected.',
			consentAbandoned: 'the consent was not granted. nothing was created.',
			consentFailed: 'turso refused the consent.',
			existingTitle: 'sign in to your organization',
			existingDescription:
				'this turso account already has an organization. its owner signs in to connect this machine to it.',
			existingConnect: 'connect this machine',
			existingConnecting: 'connecting this machine...',
			nameTitle: 'name your organization',
			nameDescription:
				'choose a name for the organization, your username, and a password. the password unlocks your place in it.',
			nameLabel: 'organization name',
			usernameLabel: 'your username',
			nameRequired: 'give the organization a name.',
			nameTooLong: 'that name is too long.',
			passwordLabel: 'your password',
			passwordFloor:
				'use at least 12 characters. this password is all that stands between the records and anyone who holds a copy.',
			passwordTooShort: 'use at least 12 characters.',
			groupNeeded:
				'turso could not tell rentable which group you picked, so type its name here once.',
			groupLabel: 'turso group',
			groupDescription:
				"the name as it reads on turso's consent screen. the organization's database goes in it.",
			groupRequired: "name the group you chose on turso's consent screen.",
			create: 'create organization',
			creating: 'creating the organization on your turso account...',
			copyLink: 'copy link',
			linkCopied: 'link copied.',
			continue: 'continue',
			back: 'back'
		},
		join: {
			title: 'connect with a link',
			description: 'paste the link and type the code that came with it.',
			linkLabel: 'link',
			reading: 'reading the link...',
			unreadable:
				'this is not a rentable link. paste the whole link, exactly as it was handed to you.',
			// the seven refusals: one line each, and each names the next step (effort 832,
			// requirement 19). What the shell said is behind the details disclosure under them.
			unreachable: 'the organization could not be reached. check the connection and try again.',
			lapsed: 'this link has lapsed. ask whoever sent it for a new one.',
			consumed: 'this link was already used here. sign in with the password you chose.',
			consumedElsewhere: 'this link was already used. ask whoever sent it for a new one.',
			revoked: 'this link was withdrawn. ask whoever sent it for a new one.',
			replaced: 'a newer link replaced this one. ask whoever sent it for the new one.',
			anotherOrganization:
				'this machine holds another organization. disconnect it at the sign-in first.',
			toSignIn: 'go to the sign-in',
			passwordTitle: 'choose your password',
			passwordDescription:
				'signs you in on any machine. nobody can recover it; only a new link gets you back in.',
			organizationLabel: 'organization',
			codeLabel: 'code',
			codeDescription: 'the six characters read out to you with the link.',
			codeWrong: 'the code is wrong. ask whoever sent you the link to read it out again.',
			codeMissing: 'type the six characters that came with the link.',
			confirmLabel: 'your password, again',
			mismatch: 'the two do not match.',
			tryAgain: 'try again',
			back: 'back'
		},
		// the block at the top of the organization section: where this machine stands with the
		// organization on turso, in one sentence (effort 828, requirement 25). A standing that
		// needs something says what needs doing; synced says when this machine last reached
		// turso. No status word stands alone here, and the only one of these that says "sync" is
		// the control, which the human named so on 2026-09-17.
		standing: {
			// the legend and the sentence of purpose, the same whatever the standing: what the block
			// is about, before the line that changes.
			title: 'this machine and turso',
			purpose:
				'the organization lives on turso and reaches this machine on its own. what you write goes out when turso is reachable.',
			// a machine that has never reached turso: a fresh machine opened offline, which is not
			// up to date and has no moment to say. *It read "up to date" until review round two of
			// effort 828.*
			notYetReached: 'this machine has not reached turso yet',
			upToDateChecked: 'up to date, checked {moment:string}',
			lastReached: 'last reached turso on {moment:string}',
			accountNeedsAttention: 'the turso account needs attention',
			accessNeedsAttention: "this machine's access needs attention",
			needsReconnecting: 'this machine needs reconnecting',
			// an owner whose machine holds no authority: the reconnect is the block below, and the
			// standing block points at it rather than drawing a second consent.
			reconnectBelow: 'the turso account is reconnected in the block below.',
			checkNow: 'sync',
			checking: 'syncing...'
		},
		dashboard: {
			// the sentence the members section opens with: who is listed, and what this section is
			// for. Short, because the cards under it say the rest.
			membersTitle: 'members',
			membersDescription: 'everybody in the organization. members are made and changed here.',
			// the same sentence for the workspaces section, and the same shape: who is listed,
			// then what this section is for.
			workspacesDescription:
				'every workspace in the organization. workspaces are made and changed here.',
			// the one line a card carries about where an account stands. It is a fact about the
			// account and nothing follows from it: a link is offered whichever of the three it says.
			standingNoPassword: 'no password yet',
			standingNoMachine: 'no machine signed in',
			standingSignedIn: 'signed in on a machine',

			memberTitle: 'a new member',
			memberDescription:
				'a username, a role and the workspaces they hold. no password until they open a link you make.',
			role: 'role',
			administratorsAreTheOwners: 'only the owner can make an administrator.',
			noWorkspaceToGrant: 'no workspace to grant yet. they can be granted one later.',
			addMember: 'add a member',
			cannotSend:
				'rentable sends nothing: copy the link below, hand it over, and give the code separately. it works once.',
			linkTitle: 'link and code',
			codeTitle: 'confirmation code',
			codeDescription:
				'read this out on a call or in person. it is the other half of what the link needs, so it is never sent beside it.',
			done: 'done',
			invitationExpires: 'the link expires {date:string}',
			// the card menu's words, one or two apiece: a menu is read at a glance, and the
			// sentence a dialog opens with is the dialog's rather than the entry's.
			makeLink: 'make a link',
			// requirement 22: the two entries on the owner's own card, one at a time, and the
			// acceptance the other person meets. Two plain words each, and the sentences that
			// say what changes belong to the surfaces they open.
			transferOwnership: 'hand over ownership',
			transferOwnershipGoes:
				'they are offered the organization. once they accept, they become the owner and you become an administrator.',
			transferOwnershipMember: 'who is offered the organization',
			transferOwnershipAuthority:
				'your turso account and its databases stay yours. the new owner connects their own before creating workspaces.',
			transferOwnershipConfirm: 'offer it',
			ownershipOffered: 'the organization was offered. they accept it on a machine of their own.',
			withdrawOffer: 'withdraw the offer',
			ownershipOfferWithdrawn: 'the offer was withdrawn. nothing changed hands.',
			acceptOwnership: 'accept ownership',
			acceptOwnershipGoes:
				'you own {organization:string} and {owner:string} becomes an administrator. your password now signs the organization.',
			acceptOwnershipAuthority:
				'the turso account stays with whoever connected it. connect yours in the organization section to create workspaces.',
			acceptOwnershipConfirm: 'accept it',
			ownershipAccepted: 'the organization is yours. you are the owner now.',
			lockOut: 'lock out',
			unsetPassword: 'reset password',
			passwordUnset: 'their password was unset. make them a link so they can choose a new one.',
			endSessions: 'sign out everywhere',
			sessionsEnded: 'they were signed out of every machine.',
			sessionsEndedPending:
				'this machine is offline; the sign-out reaches their machines once it is back online.',
			rename: 'rename',
			renameDescription:
				'the username they sign in with, on every machine. nothing tells them it changed; tell them yourself.',
			username: 'username',
			usernameRules:
				'a username is three to thirty-two characters of letters, digits, dots, underscores and hyphens',
			renamed: 'the member was renamed.',
			authorityTitle: 'turso account',
			authorityDescription:
				'this machine holds no authority over the turso account, and it cannot be restored. grant the consent again.',
			// requirement 22: an owner who was handed the organization holds no authority, and the
			// reason is not that this machine lost one. One short sentence saying where it is.
			authorityFollowsTheAccount:
				'the authority follows the turso account that granted it, not who owns the organization.',
			authorityReconnected: 'the turso account is connected on this machine.',
			remove: 'remove',
			removeDescription:
				'their access ends when their credential runs out, within four weeks. no one else is affected.',
			removeAndLockOut: 'remove and lock out',
			lockOutReading: 'reading which workspaces this touches...',
			lockOutDescription:
				'their access to {workspaces} ends now. {count|number} other {{member pauses|members pause}} syncing until reconnected.',
			removed: 'the member was removed. their access ends when their credential runs out.',
			lockedOut:
				'the member was locked out. {count|number} other {{member reconnects|members reconnect}} on their own.',
			unreachableWorkspaces:
				'you do not hold {workspaces}, so the reset could not restore it. an administrator who does can grant it again.',
			linkUnreachableWorkspaces:
				'you do not hold {workspaces}, so the link could not carry it over. an administrator who does can grant it again.',
			noWorkspaces: 'no workspace yet.',
			// what a card says about the workspaces somebody holds: how many, and not which. Which
			// ones, and what each is good for, is the surface the card's own menu opens.
			workspacesHeld: '{count|number} {{workspace|workspaces}}',
			accessFull: 'full access',
			accessReadOnly: 'read only',
			accessNone: 'no access',
			accessTakenBack:
				'taking a workspace back mints nothing, so what they already hold works until it runs out.',
			accessSaved: 'the workspaces were saved.',
			workspaceAccessTitle: 'members and access',
			workspaceAccessDescription:
				'who holds {workspace:string} and what each can do there. access taken back lasts until it runs out.',
			deleteWorkspace: 'delete workspace',
			deleteWorkspaceDescription:
				'the workspace and every record in it are deleted from turso and from every machine that syncs it. nothing puts it back.',
			workspaceDeleted: 'the workspace was deleted.',
			transferTitle: 'export and import {workspace:string}',
			forgetAccount: 'forget turso account',
			readOnlyIsTheOwners: "only the owner can grant read only access, on the owner's own machine.",
			memberSheetDescription: 'what {username:string} may do in this organization.',
			beyondRole: 'beyond their role',
			beyondRoleDescription: 'what this member can do that a member usually cannot.',
			beyondRoleNone: 'nothing beyond their role.',
			beyondRoleAdd: 'allow something else',
			// the picker's one confirm: everything ticked is allowed at once.
			allowActs: 'allow',
			administratorAllowedEvery: 'an administrator may already do all of it.',
			permissionsLegend: 'what they may do',
			actInviteMember: 'invite members',
			actRemoveMember: 'remove members',
			actChangeRole: 'change roles and permissions',
			actRenameWorkspace: 'rename workspaces',
			actResetPassword: 'issue new links',
			actRenameMember: 'rename members',
			actGrantWorkspace: 'grant workspaces',
			signingIsTheOwners:
				"only the owner can give somebody an act that writes another member's row. taking one back is yours.",
			roleChanged: 'the role and the permissions were saved.',
			// the foot of the organization section: the two acts that end something, under one quiet
			// word so that a reader scanning the section knows what the last block is before they
			// read either description.
			leavingTitle: 'leaving',
			disconnectForgets:
				"signs you out and deletes the organization's copy on this machine. nothing on turso changes.",
			disconnect: 'disconnect',
			disconnected: 'this machine no longer holds the organization.',
			forgetAccountDescription:
				"this machine holds a token for the organization's turso account. forget it, and nothing here reaches that account.",
			forgetAccountRevokes:
				"forgetting does not revoke the token. end the grant yourself on turso's dashboard at app.turso.tech.",
			forgetAccountRevokesAt: 'app.turso.tech',
			accountForgotten: 'this machine no longer holds a token for your turso account.',
			deleteOrganization: 'delete organization',
			deleteOrganizationDescription:
				'the organization and every workspace in it are deleted from your turso account. nothing puts them back.',
			deleteOrganizationGoes:
				'every workspace and every record in it is deleted, and every member loses their way in. nothing puts this back.',
			organizationDeleted: 'the organization was deleted.'
		},

		/**
		 * who each role is for, in one sentence apiece (effort 828, requirement 23).
		 *
		 * A role is described by the person it suits rather than by the acts it unlocks, which is
		 * what every product in the research does and what makes the chooser readable without the
		 * table beside it. The administrator's names the one thing the word does not cover.
		 */
		roles: {
			owner: {
				who: 'holds the turso account and can do anything. there is one owner, and only they can hand it over.'
			},
			administrator: {
				who: "adds members, makes links and grants workspaces. the turso account stays the owner's."
			},
			member: {
				who: 'works in the workspaces they hold, and changes nothing about anybody else unless you allow it.'
			}
		},

		/**
		 * what each act lets a person do, said as the thing they can do.
		 *
		 * These lines are the one place the seven acts are explained: the sheet's list, the picker
		 * that allows one, and the role table all read them, so an act is worded once. Short, and
		 * each starts with *can*, because they are read as a list of what one person may do rather
		 * than as a form's labels.
		 */
		acts: {
			inviteMember: { does: 'can invite members' },
			removeMember: { does: 'can remove members' },
			changeRole: { does: 'can change what a member may do' },
			renameWorkspace: { does: 'can rename a workspace' },
			resetPassword: { does: "can reset a member's password" },
			renameMember: { does: 'can rename members' },
			grantWorkspace: { does: 'can give a member a workspace' }
		},

		/** what each access level is good for, beside the level's own name. */
		levels: {
			full: { does: 'reads and writes everything in it.' },
			readOnly: { does: 'reads it, and writes nothing.' },
			none: { does: 'does not reach it at all.' }
		},

		/**
		 * the read-only table, opened from the members tray and edited nowhere.
		 *
		 * The comparison belongs beside the chooser rather than inside it: a person consults it
		 * before picking a role, and picking one is a single control either way.
		 */
		roleTable: {
			title: 'what each role may do',
			description:
				'a role is what somebody is called and what they start with. anything else is allowed on their own sheet.',
			given: 'what you can give somebody',
			memberNote: 'a member starts with none of these, and is allowed them on their own sheet.',
			ownerAlone: 'the owner alone',
			ownerAloneReason:
				'these run on the turso account the owner connected, so nobody can be given them.',
			allowed: 'yes',
			notAllowed: 'no',
			createWorkspace: 'make a new workspace.',
			deleteWorkspace: 'delete a workspace and everything in it.',
			lockOut: 'cut somebody off from every workspace at once.',
			renew: 'renew the credentials that keep everybody syncing.',
			tursoAccount: 'connect the turso account, and forget it.'
		}
	},

	workspace: {
		nameTooLong: 'that name is too long.',
		nameRequired: 'give this workspace a name.',
		rename: 'rename',
		renameDescription: 'what this workspace is called, on every machine signed in to it.',
		renamed: 'the workspace was renamed.',
		credentialRefused:
			'your access was renewed and this machine is fetching it. work goes on here; if it does not clear, ask the owner.',
		accountRefusedMember:
			"the organization's turso account needs attention, so nothing reaches turso for now. tell {owner}. work here goes on.",
		accountRefusedOwner:
			"turso is refusing the organization's account: {detail}. work goes on here; fix it at app.turso.tech to send it.",
		accountRefusedOwnerNoDetail:
			"turso is refusing the organization's account. work goes on here; fix it at app.turso.tech to send it.",
		transferDescription:
			'write every record to one workbook, or read one in. records name each other, so the file opens on any machine.'
	}
} satisfies BaseTranslation;

export default en;
