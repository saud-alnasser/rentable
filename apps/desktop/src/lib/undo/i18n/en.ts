// The undo capability's strings in english, composed back into `i18n/en/index.ts` at `common.undo`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const common = {
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
	}
} satisfies BaseTranslation;
