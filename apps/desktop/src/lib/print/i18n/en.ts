// The print capability's strings in english, composed back into `i18n/en/index.ts` at `print`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

// the preview a page opens in before it is printed or saved, whatever the page is.
export const print = {
	failed: 'the page could not be printed.',
	language: 'language of the page',
	print: 'print',
	save: 'save as PDF',
	saved: 'PDF saved'
} satisfies BaseTranslation;
