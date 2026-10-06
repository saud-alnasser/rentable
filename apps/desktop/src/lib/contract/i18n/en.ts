// The contract feature's strings in english, composed back into `i18n/en/index.ts` at `contracts`,
// `common.refusals.contract`, `common.actions` and `common.labels`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const contracts = {
	// a contract's card in a grid, whose facts are named fields: a count is the figure under its
	// field's name, and a field holding nothing says so in a word rather than as a zero.
	card: {
		cost: 'cost · {interval:string}',
		none: 'none',
		paidOfExpected: 'paid of expected',
		paymentCount: '{count|number}',
		// what stands between two of the units' names: the list's separator alone, since a
		// conjunction before the last name is noise in a field that only lists.
		unitSeparator: ', '
	},

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

	ranks: {
		dueSoon: 'due soon',
		endingSoon: 'ending soon',
		overdue: 'overdue',
		owing: 'owing'
	},

	// the message a tenant is reminded with on WhatsApp. It is a letter the tenant reads rather
	// than a label on the screen, so it opens in capitals as a letter does. `owed` is for rent
	// already due, `comingDue` for rent falling due this week, and each has a form for a
	// contract that holds no units.
	reminder: {
		comingDue:
			'Hello {tenant}, a reminder that the rent of SAR {amount} on contract {contract} falls due on {date}. Thank you.',
		comingDueNoNumber:
			'Hello {tenant}, a reminder that the rent of SAR {amount} on your contract falls due on {date}. Thank you.',
		language: 'language of the message',
		noPhone: 'the tenant has no phone number to send a reminder to.',
		open: 'open WhatsApp',
		owed: 'Hello {tenant}, a reminder that the rent of SAR {amount} on contract {contract} has been due since {date}. Thank you.',
		owedNoNumber:
			'Hello {tenant}, a reminder that the rent of SAR {amount} on your contract has been due since {date}. Thank you.'
	},

	// a contract's cycles, one row each, with the payments allocated to them oldest first.
	schedule: {
		columns: {
			amount: 'amount due',
			covered: 'paid',
			due: 'due date',
			state: 'state'
		},
		// the name a late row's state is read by where part of it is paid, so the part is heard
		// with the lateness rather than left for a column the reader has to find.
		latePart: 'late; {covered:string} of {amount:string} paid',
		// the act that prints it, and what the printed page is headed, in the language chosen.
		print: 'print schedule',
		printTitle: 'payment schedule',
		stateDescriptions: {
			due: 'due today and not paid in full',
			late: 'past its due date and not paid in full',
			paid: 'paid in full',
			partlyPaid: 'not due yet; part of it is paid',
			upcoming: 'not due yet; nothing paid toward it'
		},
		states: {
			due: 'due today',
			late: 'late',
			paid: 'paid',
			partlyPaid: 'partly paid',
			upcoming: 'upcoming'
		},
		title: 'schedule'
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
		paymentRefusedRefundsExceedReceived:
			'{count|number} would leave the refunds above what the contract received',
		refusedHoldsPayments: '{count|number} still carry payments',
		refusedMissing: '{count|number} are no longer in the workspace',
		refusedNotRestorable: '{count|number} are not terminated',
		refusedNotTerminable: '{count|number} cannot be terminated by hand',
		refusedUnitsTaken: '{count|number} hold a unit another contract now holds',
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
} satisfies BaseTranslation;

export const refusals = {
	contract: {
		costNotPositive: 'cost per payment must be greater than zero.',
		endBeforeStart: 'end date must be after start date.',
		govIdTaken: 'government ID is associated with another contract.',
		govIdTakenNamed: 'government ID {named:string} is associated with another contract.',
		holdsPayments: 'this contract has payments. delete them before deleting it.',
		missing: 'this contract is no longer in the workspace. reload to see what changed.',
		notTerminable: 'only an active, fulfilled or past contract can be terminated.',
		nothingToRemind: 'this contract owes nothing and has nothing falling due this week.',
		notUnterminable: 'only a terminated contract can be restored.',
		paidInFull: 'this contract is paid in full and takes no more payments.',
		refundAboveLimit: 'a refund on this contract cannot exceed {limit:number|number}.',
		refundsExceedReceived:
			'the refunds on this contract would exceed what it received. delete a refund first.',
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
		unitRepeatedNamed: '{named:string} is named twice for one contract. name each unit once.',
		unitsMissing:
			'one or more of these units are no longer in the workspace. reload to see what changed.',
		unitsTaken:
			'another contract holds one or more of the chosen units over this term. choose other units or a different term.',
		unitsTakenNamed: 'another contract holds {named:string} over these dates. free it first.',
		unitsUnavailable:
			'another contract holds one or more of these units over the selected term. choose a different term.'
	}
} satisfies BaseTranslation;

// the create control's label on this feature's list and the labels of its acts, composed back at
// `common.actions`, and the contract's field and column labels, at `common.labels`.
export const common = {
	actions: {
		newContract: 'new contract',
		remind: 'remind tenant',
		unterminate: 'unterminate',
		renew: 'renew',
		renewing: 'renewing...',
		restoring: 'restoring...',
		terminate: 'terminate',
		terminating: 'terminating...'
	},
	labels: {
		costPerPayment: 'cost per cycle',
		cycle: 'cycle',
		end: 'end',
		expected: 'expected',
		governmentId: 'government ID',
		governmentIdOptional: 'government ID (optional)',
		paid: 'paid',
		rank: 'attention',
		start: 'start'
	}
} satisfies BaseTranslation;
