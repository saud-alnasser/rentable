// The tenant feature's strings in english, composed back into `i18n/en/index.ts` at `tenants`,
// `common.refusals.tenant` and `common.actions`. It imports nothing but types, because the typesafe-i18n generator
// transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const tenants = {
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
} satisfies BaseTranslation;

export const refusals = {
	tenant: {
		gone: 'this tenant is no longer in the workspace. reload to see what changed.',
		holdsContracts: 'contracts mention this tenant, so it cannot be deleted.',
		nationalIdTaken: 'national ID is associated with a registered tenant.',
		nationalIdTakenNamed: 'national ID {named:string} is associated with a registered tenant.',
		phoneTaken: 'phone is associated with a registered tenant.',
		phoneTakenNamed: 'phone {named:string} is associated with a registered tenant.',
		repeatedInSet: 'two tenants in this set claim {value:string}.'
	}
} satisfies BaseTranslation;

// the create control's label on this feature's list, composed back at `common.actions`.
export const common = {
	actions: {
		newTenant: 'new tenant'
	}
} satisfies BaseTranslation;
