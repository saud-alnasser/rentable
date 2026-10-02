// The settings feature's strings in english, composed back into `i18n/en/index.ts` at `settings`,
// `settingsHooks`, `common.actions` and `common.labels`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const settings = {
	diagnosticsDescription:
		'a record of what rentable does, for looking into failures. it stays here, and passwords and tokens are left out.',
	diagnosticsFolder: 'log folder',
	// the icon control that opens the log folder: its accessible name and its tooltip (effort 846).
	diagnosticsReveal: 'open log folder',
	diagnosticsTitle: 'diagnostics',

	downloadingUpdate: 'downloading update',

	latestRelease: "you're already on the latest release.",

	loadErrorTitle: 'settings are unavailable right now',

	transferImportTitle: 'import into {workspace:string}',
	transferImportSuccess: 'the file was imported',

	restartNotice: 'update installed. restart rentable to finish.',

	// the language and appearance card: its title and its one line (effort 846, *Everything in a
	// tab is a card*).
	preferences: {
		title: 'language and appearance',
		description: 'how rentable reads and looks on this machine.'
	},
	localeTitle: 'language',

	appearanceTitle: 'appearance',
	// the tooltip on the system choice, the one whose word does not say what it does (effort 846).
	appearanceSystemHint: 'follows your computer as it turns light or dark',
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

	// what the updates card's header says at its end, in words: where this installation stands
	// (effort 846, *Everything in a tab is a card*).
	updatesState: {
		checking: 'checking',
		upToDate: 'up to date',
		available: 'update available',
		downloading: 'downloading',
		restart: 'restart to finish'
	},
	// the chevron that opens a release's notes under the available version, and the date in them.
	whatsNew: "what's new in {version:string}",
	releasedOn: 'released {date:string}',
	updatesDescription:
		'check for a newer version and install it. if the app then fails to start, it offers the version you were on.',
	updatesTitle: 'updates',

	// the one quiet control at the foot of every step of the way in (effort 843, requirement 7).
	wayIn: {
		preferences: 'language and appearance'
	},

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
			action: 'sign out all other machines',
			confirmDescription:
				'every other machine is signed out, and your password signs each one in again. this one stays signed in.',
			ended: 'your other machines were signed out.',
			endedPending:
				'this machine is offline; the sign-out reaches the others once it is back online.'
		},
		// effort 846, requirements 9 to 11: every machine signed in as the reader, a row each, this
		// one first, and each other one signed out from its row's menu.
		machines: {
			title: 'machines',
			description: 'signing a machine out leaves your password as it is.',
			// the machines card's header value: how many machines are signed in as the reader.
			signedIn: '{count:number} signed in',
			thisMachine: 'this machine',
			unnamed: 'a machine added {date:string}',
			lastSeen: 'last seen {moment:string}',
			added: 'added {date:string}',
			notUpdated: 'not on this version yet',
			// the row's menu, named for the machine it acts on (ticket 23 of effort 846).
			menu: 'actions for {machine:string}',
			confirmTitle: 'sign out a machine',
			confirmDescription:
				'it is signed out when it next reaches Turso, and your password signs it in again. your password does not change.',
			ended: 'the machine was signed out.',
			endedPending:
				'this machine is offline; the sign-out reaches that machine once this one is back online.'
		},
		// requirement 22: drawn for the one person an offer stands with, and absent for
		// everybody else. A row naming who offered it, the act, and what accepting changes.
		ownership: {
			title: 'ownership',
			offeredBy: 'offered by {owner:string}',
			consequence: 'accepting makes you the owner and makes them a manager.'
		},
		// effort 846, requirement 8: the last group of the section, and the one way out of it.
		thisMachine: {
			title: 'this machine',
			signOut: 'sign out of this machine',
			description: 'the organization stays on this machine. sign in again to carry on.'
		}
	}
} satisfies BaseTranslation;

export const settingsHooks = {
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
