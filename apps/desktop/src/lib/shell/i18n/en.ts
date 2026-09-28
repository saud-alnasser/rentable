// The shell's strings in english, composed back into `i18n/en/index.ts` at `layout.notFound`,
// `layout.error` and `common.window`. It imports nothing but types, because the typesafe-i18n
// generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const layout = {
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
	}
} satisfies BaseTranslation;

export const common = {
	window: {
		close: 'close window',
		minimize: 'minimize window',
		toggleMaximize: 'toggle maximize window'
	}
} satisfies BaseTranslation;
