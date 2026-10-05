// The permission capability's strings in english, composed back into `i18n/en/index.ts` at
// `common.permission`. It imports nothing but types, because the typesafe-i18n generator transpiles
// it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const common = {
	// why a record control is refused for who is reading (effort 838, requirement 10): the flag
	// they lack, or a read-only grant on the workspace open, which takes every write away.
	permission: {
		missing: {
			viewComplex: 'you do not have permission to view complexes.',
			createComplex: 'you do not have permission to add complexes.',
			editComplex: 'you do not have permission to edit complexes.',
			deleteComplex: 'you do not have permission to delete complexes.',
			viewUnit: 'you do not have permission to view units.',
			createUnit: 'you do not have permission to add units.',
			editUnit: 'you do not have permission to edit units.',
			deleteUnit: 'you do not have permission to delete units.',
			viewTenant: 'you do not have permission to view tenants.',
			createTenant: 'you do not have permission to add tenants.',
			editTenant: 'you do not have permission to edit tenants.',
			deleteTenant: 'you do not have permission to delete tenants.',
			viewContract: 'you do not have permission to view contracts.',
			createContract: 'you do not have permission to add contracts.',
			editContract: 'you do not have permission to edit contracts.',
			deleteContract: 'you do not have permission to delete contracts.',
			viewPayment: 'you do not have permission to view payments.',
			createPayment: 'you do not have permission to add payments.',
			editPayment: 'you do not have permission to edit payments.',
			deletePayment: 'you do not have permission to delete payments.'
		},
		readOnly: 'your access to this workspace is read only, so nothing in it can be changed.',
		// a locked account (effort 851, requirement 32): it views, and changes nothing until it is
		// unlocked, whatever its role and its grant say.
		locked:
			'your account is locked, so nothing can be changed until an owner or a manager unlocks it.'
	}
} satisfies BaseTranslation;
