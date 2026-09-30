// The settings feature's strings in english, composed back into `i18n/en/index.ts` at `settings`,
// `settingsHooks`, `common.actions` and `common.labels`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const settings = {
	diagnosticsDescription:
		'a record of what rentable does, for looking into failures. it stays here, and passwords and tokens are left out.',
	diagnosticsReveal: 'open log folder',
	diagnosticsTitle: 'diagnostics',

	downloadingUpdate: 'downloading update',

	endingSoonDescription:
		'a contract starts showing as ending soon on the dashboard this many days before it ends.',
	endingSoonInvalid: 'the number of days must be greater than zero',
	endingSoonTitle: 'ending soon',

	latestRelease: "you're already on the latest release.",

	loadErrorTitle: 'settings are unavailable right now',

	transferImportTitle: 'import a workspace',
	transferImportSuccess: 'the file was imported',

	restartNotice: 'update installed. restart rentable to finish.',

	localeDescription: 'the interface changes as soon as you pick one.',
	localeTitle: 'language',

	appearanceTitle: 'appearance',
	appearanceDescription: 'light or dark, or follow your system as it changes.',
	appearance: {
		system: 'system',
		light: 'light',
		dark: 'dark'
	},

	// the four sections of the settings area, each named for what it holds and in the order the
	// rail draws them rather than in alphabetical order: the order is read here as a list.
	section: {
		general: 'general',
		account: 'account',
		organization: 'organization',
		workspaces: 'workspaces'
	},

	title: 'settings',

	updatesChecking: 'checking for updates...',
	updatesDescription:
		'check for a newer version and install it. if the app then fails to start, it offers the version you were on.',
	updatesTitle: 'updates',

	you: {
		signedInAs: 'signed in as',
		password: {
			title: 'password',
			description: 'the password you sign in with, on every machine.',
			currentLabel: 'current password',
			nextLabel: 'new password',
			confirmLabel: 'new password, again',
			mismatch: 'the two do not match.',
			change: 'change password',
			changed: 'your password was changed.'
		},
		sessions: {
			title: 'other machines',
			description: 'sign out everywhere but here. your password stays the same.',
			action: 'sign out of other machines',
			confirmDescription:
				'every other machine signed in as you is signed out. this one stays signed in, and your password does not change.',
			ended: 'your other machines were signed out.',
			endedPending:
				'this machine is offline; the sign-out reaches the others once it is back online.'
		},
		// requirement 22: drawn for the one person an offer stands with, and absent for
		// everybody else. One sentence naming who offered it, and the act.
		ownership: {
			title: 'ownership',
			offered:
				'{owner:string} has offered you this organization. accepting makes you the owner and makes them a manager.'
		}
	}
} satisfies BaseTranslation;

export const settingsHooks = {
	endingSoonUpdated: 'ending soon notice window updated successfully!',
	workspaceUpToDate: 'everything is up to date.'
} satisfies BaseTranslation;

// the update's controls and the labels of its block, which the settings' general tab draws
// (`component/updates.svelte`), and the retry of a settings read that failed, composed back at
// `common.actions` and `common.labels`.
export const common = {
	actions: {
		checkForUpdates: 'check for updates',
		downloadAndInstall: 'download & install',
		installingUpdate: 'installing update...',
		checkingForUpdates: 'checking for updates...',
		restartApp: 'restart app',
		retry: 'retry'
	},
	labels: {
		releaseNotes: 'release notes',
		availableVersion: 'available version',
		currentVersion: 'current version',
		releaseDate: 'release date'
	}
} satisfies BaseTranslation;
