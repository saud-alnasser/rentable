// The update feature's strings in english, composed back into `i18n/en/index.ts` at `update`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

// effort 857, requirements 11 and 12: one sentence for each place the update can stand, said by
// the update action wherever it is drawn and by the toasts the settings card and the launch raise.
export const update = {
	idle: 'see whether a newer version of rentable is out.',
	checking: 'looking for a newer version of rentable...',
	available: 'rentable {version:string} is available.',
	downloading: 'downloading rentable {version:string}...',
	ready: 'rentable {version:string} is ready. restart to finish updating.',
	installing: 'installing rentable {version:string}. it starts again by itself.',
	upToDate: "you're on the latest version of rentable.",
	offline:
		'rentable could not reach the internet to look for updates. check your connection and try again.',
	failed: 'the update could not be finished. try again.',
	actions: {
		check: 'check for updates',
		download: 'download',
		restart: 'restart to update',
		tryAgain: 'try again'
	}
} satisfies BaseTranslation;
