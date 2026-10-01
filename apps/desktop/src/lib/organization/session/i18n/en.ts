// The organization session's strings in english: the sign-in card and the account menu's sign-out,
// composed back into `i18n/en/index.ts` at `layout.signIn` and `common.actions`. It imports nothing
// but types, because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../../i18n/i18n-types';

export const layout = {
	signIn: {
		// the product's own name, which the welcome draws as it is written.
		noOrganizationTitle: 'rentable',
		noOrganizationSubtitle: 'track rent, receipts and reminders.',
		subtitle: 'sign in to continue.',
		help: "can't sign in?",
		helpAnswer: 'ask a manager or the owner of your organization for help.',
		username: 'username',
		password: 'password',
		unlocking: 'signing you in. this takes a moment on purpose.',
		roleOwner: 'owner',
		roleManager: 'manager',
		roleMember: 'member',
		setUp: 'set up with Turso',
		setUpDescription: 'for the owner of the organization.',
		connectByLink: 'join with a link',
		connectByLinkDescription: 'for anyone who was sent a link.',
		signedOutElsewhere:
			'you were signed out of this machine from another one. sign in again to carry on.',
		useALink: 'use a link',
		disconnect: 'disconnect this machine',
		disconnectDescription:
			'this machine deletes its copy of the organization and its workspaces, and forgets the Turso account. nothing on Turso changes. the owner connects again with their Turso account; anyone else needs a new link.'
	}
} satisfies BaseTranslation;

// the account menu's sign-out, composed back at `common.actions`.
export const common = {
	actions: {
		signOut: 'sign out'
	}
} satisfies BaseTranslation;
