// The startup feature's strings in english, composed back into `i18n/en/index.ts` at
// `layout.startup` and `common.actions`. It imports nothing but types, because the typesafe-i18n
// generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const layout = {
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
			'bringing the workspace up to this version of rentable. this reaches Turso and takes a moment; nothing here is stuck.',
		migrationWaiting:
			'another member is bringing the workspace up to this version of rentable. waiting on them, until {until} at the latest.',
		stagePrepare: 'creating your first workspace',
		stageSettings: 'reading your settings',
		stageWorkspace: 'opening your workspace'
	}
} satisfies BaseTranslation;

// the controls the startup's failure and recovery screens offer, composed back at
// `common.actions`.
export const common = {
	actions: {
		openPreviousRelease: 'open previous release',
		retryStartup: 'retry startup'
	}
} satisfies BaseTranslation;
