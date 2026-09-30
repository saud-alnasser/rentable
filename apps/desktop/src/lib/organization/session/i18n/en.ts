// The organization session's strings in english: the sign-in card and the account menu's sign-out,
// composed back into `i18n/en/index.ts` at `layout.signIn` and `common.actions`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale.

import type { BaseTranslation } from '../../../i18n/i18n-types';

export const layout = {
	signIn: {
		noOrganizationTitle: 'welcome',
		noOrganizationSubtitle: 'no organization on this machine yet.',
		subtitle: 'sign in to continue',
		help: 'trouble signing in?',
		username: 'username',
		password: 'password',
		unlocking: 'signing you in. this takes a moment on purpose.',
		roleOwner: 'owner',
		roleManager: 'manager',
		roleMember: 'member',
		setUp: 'use your Turso account',
		setUpDescription: 'you own the organization.',
		connectByLink: 'use a link and code',
		connectByLinkDescription: 'you were given a link and a code.',
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
