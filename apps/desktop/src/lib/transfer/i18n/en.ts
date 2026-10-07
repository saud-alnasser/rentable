// The transfer capability's strings in english, composed back into `i18n/en/index.ts` at
// `common.import`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const common = {
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
			unresolved: 'names {detail:string}, which is not here',
			claimTaken: '{detail:string} is already held over these dates'
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
		skippedClaimed: '{count|number} taking what is already held',
		skippedUnreadable: '{count|number} could not be read',
		more: 'and {count|number} more'
	}
} satisfies BaseTranslation;
