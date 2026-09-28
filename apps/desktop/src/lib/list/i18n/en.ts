// The list capability's strings in english, composed back into `i18n/en/index.ts` at
// `common.export`, `common.periods`, `common.selection` and `common.table`. It imports nothing but
// types, because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const common = {
	export: {
		description: 'which file should this become?',
		nothingToExport: 'there is nothing here to export'
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
			'the workspace changed while this was open, so {count|number} {{record|records}} could not be done. nothing was retried.'
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
	}
} satisfies BaseTranslation;
