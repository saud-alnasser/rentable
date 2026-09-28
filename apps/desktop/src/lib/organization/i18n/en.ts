// The organization feature's strings in english, composed back into `i18n/en/index.ts` at
// `organization`, `layout.accountMenu` and `layout.signIn`. It imports nothing but types, because
// the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const organization = {
	// the one image the organization prints at the foot of its pages (effort 835).
	mark: {
		alt: "the organization's signature or seal",
		choose: 'choose image',
		description: 'printed at the foot of every receipt and schedule.',
		none: 'none added yet',
		readOnly: 'somebody allowed to change the mark can change it.',
		remove: 'remove',
		removed: 'signature or seal removed',
		replace: 'replace image',
		saved: 'signature or seal saved',
		title: 'signature or seal'
	},
	setup: {
		connectTitle: 'connect your Turso account',
		connectDescription: 'your organization lives on your own Turso account.',
		connectDetails: 'before you connect',
		position: 'step {step|number} of {total|number}',
		groupCoverage:
			'the consent covers every database in the group you choose, and nothing outside it.',
		oneOrganization:
			'a group holds one organization. a group that already holds one is connected to, not refused.',
		accountCreation:
			'a free or developer Turso account holds one group, so keep one for rentable alone. on a paid one, pick an empty group.',
		succession:
			"only you, or a Turso organization's admin, can grant access again, and Turso can move a group. rentable does neither.",
		groupAskedOnce:
			'a group holding nothing yet is asked its name once, on the next step; Turso names it nowhere.',
		openDashboard: 'open Turso dashboard',
		connect: 'connect Turso account',
		connecting: 'finish the consent in the browser window that just opened.',
		connected: 'Turso account connected.',
		consentAbandoned: 'the consent was not granted. nothing was created.',
		consentFailed: 'Turso refused the consent.',
		existingTitle: 'sign in to your organization',
		existingDescription:
			'this Turso account already has an organization. its owner signs in to connect this machine to it.',
		existingConnect: 'connect this machine',
		existingConnecting: 'connecting this machine...',
		nameTitle: 'name your organization',
		nameDescription:
			'choose a name for the organization, your username, and a password. the password unlocks your place in it.',
		nameLabel: 'organization name',
		usernameLabel: 'your username',
		nameRequired: 'give the organization a name.',
		nameTooLong: 'that name is too long.',
		passwordLabel: 'your password',
		passwordFloor:
			'use at least 12 characters. this password is all that stands between the records and anyone who holds a copy.',
		passwordTooShort: 'use at least 12 characters.',
		groupNeeded:
			'Turso could not tell rentable which group you picked, so type its name here once.',
		groupLabel: 'Turso group',
		groupDescription:
			"the name as it reads on Turso's consent screen. the organization's database goes in it.",
		groupRequired: "name the group you chose on Turso's consent screen.",
		create: 'create organization',
		creating: 'creating the organization on your Turso account...',
		copyLink: 'copy link',
		linkCopied: 'link copied.',
		continue: 'continue',
		back: 'back'
	},
	join: {
		title: 'connect with a link',
		description: 'paste the link and type the code that came with it.',
		linkLabel: 'link',
		reading: 'reading the link...',
		unreadable:
			'this is not a rentable link. paste the whole link, exactly as it was handed to you.',
		// the seven refusals: one line each, and each names the next step (effort 832,
		// requirement 19). What the shell said is behind the details disclosure under them.
		unreachable: 'the organization could not be reached. check the connection and try again.',
		lapsed: 'this link has lapsed. ask whoever sent it for a new one.',
		consumed: 'this link was already used here. sign in with the password you chose.',
		consumedElsewhere: 'this link was already used. ask whoever sent it for a new one.',
		revoked: 'this link was withdrawn. ask whoever sent it for a new one.',
		replaced: 'a newer link replaced this one. ask whoever sent it for the new one.',
		anotherOrganization:
			'this machine holds another organization. disconnect it at the sign-in first.',
		toSignIn: 'go to the sign-in',
		passwordTitle: 'choose your password',
		passwordDescription:
			'signs you in on any machine. nobody can recover it; only a new link gets you back in.',
		organizationLabel: 'organization',
		codeLabel: 'code',
		codeDescription: 'the six characters read out to you with the link.',
		codeWrong: 'the code is wrong. ask whoever sent you the link to read it out again.',
		codeMissing: 'type the six characters that came with the link.',
		confirmLabel: 'your password, again',
		mismatch: 'the two do not match.',
		tryAgain: 'try again',
		back: 'back'
	},
	// the block at the top of the organization section: where this machine stands with the
	// organization on Turso, in one sentence (effort 828, requirement 25). A standing that
	// needs something says what needs doing; synced says when this machine last reached
	// Turso. No status word stands alone here, and the only one of these that says "sync" is
	// the control, which the human named so on 2026-09-17.
	standing: {
		// the legend and the sentence of purpose, the same whatever the standing: what the block
		// is about, before the line that changes.
		title: 'this machine and Turso',
		purpose:
			'the organization lives on Turso and reaches this machine on its own. what you write goes out when Turso is reachable.',
		// a machine that has never reached Turso: a fresh machine opened offline, which is not
		// up to date and has no moment to say. *It read "up to date" until review round two of
		// effort 828.*
		notYetReached: 'this machine has not reached Turso yet',
		upToDateChecked: 'up to date, checked {moment:string}',
		lastReached: 'last reached Turso on {moment:string}',
		accountNeedsAttention: 'the Turso account needs attention',
		accessNeedsAttention: "this machine's access needs attention",
		needsReconnecting: 'this machine needs reconnecting',
		// an owner whose machine holds no authority: the reconnect is the block below, and the
		// standing block points at it rather than drawing a second consent.
		reconnectBelow: 'the Turso account is reconnected in the block below.',
		checkNow: 'sync',
		checking: 'syncing...'
	},
	dashboard: {
		// the sentence the members section opens with: who is listed, and what this section is
		// for. Short, because the cards under it say the rest.
		membersTitle: 'members',
		membersDescription: 'everybody in the organization. members are made and changed here.',
		// the same sentence for the workspaces section, and the same shape: who is listed,
		// then what this section is for.
		workspacesDescription:
			'every workspace in the organization. workspaces are made and changed here.',
		// the one line a card carries about where an account stands. It is a fact about the
		// account and nothing follows from it: a link is offered whichever of the three it says.
		standingNoPassword: 'no password yet',
		standingNoMachine: 'no machine signed in',
		standingSignedIn: 'signed in on a machine',

		memberTitle: 'a new member',
		memberDescription:
			'a username, a role and the workspaces they hold. no password until they open a link you make.',
		role: 'role',
		noWorkspaceToGrant: 'no workspace to grant yet. they can be granted one later.',
		// the workspace's own dialog with nobody to list: the owner and the reader are not.
		noMemberToGrant: 'no member to put in this workspace yet.',
		addMember: 'add a member',
		cannotSend:
			'rentable sends nothing: copy the link below, hand it over, and give the code separately. it works once.',
		linkTitle: 'link and code',
		codeTitle: 'confirmation code',
		codeDescription:
			'read this out on a call or in person. it is the other half of what the link needs, so it is never sent beside it.',
		done: 'done',
		invitationExpires: 'the link expires {date:string}',
		// the card menu's words, one or two apiece: a menu is read at a glance, and the
		// sentence a dialog opens with is the dialog's rather than the entry's.
		makeLink: 'make a link',
		// requirement 22: the two entries on the owner's own card, one at a time, and the
		// acceptance the other person meets. Two plain words each, and the sentences that
		// say what changes belong to the surfaces they open.
		transferOwnership: 'hand over ownership',
		transferOwnershipGoes:
			'they are offered the organization. once they accept, they become the owner and you become a manager.',
		transferOwnershipMember: 'who is offered the organization',
		transferOwnershipAuthority:
			'your Turso account and its databases stay yours. the new owner connects their own before creating workspaces.',
		transferOwnershipConfirm: 'offer it',
		ownershipOffered: 'the organization was offered. they accept it on a machine of their own.',
		withdrawOffer: 'withdraw the offer',
		ownershipOfferWithdrawn: 'the offer was withdrawn. nothing changed hands.',
		acceptOwnership: 'accept ownership',
		acceptOwnershipGoes:
			'you own {organization:string} and {owner:string} becomes a manager. your password now signs the organization.',
		acceptOwnershipAuthority:
			'the Turso account stays with whoever connected it. connect yours in the organization section to create workspaces.',
		acceptOwnershipConfirm: 'accept it',
		ownershipAccepted: 'the organization is yours. you are the owner now.',
		lockOut: 'lock out',
		unsetPassword: 'reset password',
		passwordUnset: 'their password was unset. make them a link so they can choose a new one.',
		endSessions: 'sign out everywhere',
		sessionsEnded: 'they were signed out of every machine.',
		sessionsEndedPending:
			'this machine is offline; the sign-out reaches their machines once it is back online.',
		rename: 'rename',
		renameDescription:
			'the username they sign in with, on every machine. nothing tells them it changed; tell them yourself.',
		username: 'username',
		// the line under the username on the sheet that adds a member.
		usernameDescription: 'the username they sign in with, on every machine.',
		usernameRules:
			'a username is three to thirty-two characters of letters, digits, dots, underscores and hyphens',
		renamed: 'the member was renamed.',
		authorityTitle: 'Turso account',
		authorityDescription:
			'this machine holds no authority over the Turso account, and it cannot be restored. grant the consent again.',
		// requirement 22: an owner who was handed the organization holds no authority, and the
		// reason is not that this machine lost one. One short sentence saying where it is.
		authorityFollowsTheAccount:
			'the authority follows the Turso account that granted it, not who owns the organization.',
		authorityReconnected: 'the Turso account is connected on this machine.',
		remove: 'remove',
		removeDescription:
			'their access ends when their credential runs out, within four weeks. no one else is affected.',
		removeAndLockOut: 'remove and lock out',
		lockOutReading: 'reading which workspaces this touches...',
		lockOutDescription:
			'their access to {workspaces} ends now. {count|number} other {{member pauses|members pause}} syncing until reconnected.',
		removed: 'the member was removed. their access ends when their credential runs out.',
		lockedOut:
			'the member was locked out. {count|number} other {{member reconnects|members reconnect}} on their own.',
		unreachableWorkspaces:
			'you do not hold {workspaces}, so the reset could not restore it. a manager who does can grant it again.',
		linkUnreachableWorkspaces:
			'you do not hold {workspaces}, so the link could not carry it over. a manager who does can grant it again.',
		noWorkspaces: 'no workspace yet.',
		// what a card says about the workspaces somebody holds: how many, and not which. Which
		// ones, and which of them are locked to read only, is the sheet the card's edit opens.
		workspacesHeld: '{count|number} {{workspace|workspaces}}',
		accessFull: 'full access',
		// the line under the workspaces on the sheet that adds a member.
		memberWorkspacesDescription: 'the workspaces they can open. switch one on to let them in.',
		accessSaved: 'the workspaces were saved.',
		workspaceAccessTitle: 'members and access',
		workspaceAccessDescription:
			'who can open {workspace:string}. switch someone on to let them in. access taken back lasts until it runs out.',
		deleteWorkspace: 'delete workspace',
		deleteWorkspaceDescription:
			'the workspace and every record in it are deleted from Turso and from every machine that syncs it. nothing puts it back.',
		workspaceDeleted: 'the workspace was deleted.',
		transferTitle: 'export and import {workspace:string}',
		forgetAccount: 'forget Turso account',
		memberSheetDescription: 'what {username:string} may do in this organization.',
		roleChanged: 'the role was saved.',
		overrideSaved: 'what they may do was saved.',
		// why a control on a member's card is refused (effort 838, requirement 12): the member
		// ranks at or above the reader, the card is the reader's own, or the reader lacks the flag.
		notBelowYou: 'they are not below you, so somebody who ranks above them does this.',
		yourOwn: 'this is you: your role and permissions are changed by somebody who ranks above you.',
		lacksFlag: 'you may not {flag:string}.',
		roleOutOfReach: 'a role at or above your own is given by somebody who ranks above it.',
		// the foot of the organization section: the two acts that end something, under one quiet
		// word so that a reader scanning the section knows what the last block is before they
		// read either description.
		leavingTitle: 'leaving',
		disconnectForgets:
			"signs you out and deletes the organization's copy on this machine. nothing on Turso changes.",
		disconnect: 'disconnect',
		disconnected: 'this machine no longer holds the organization.',
		forgetAccountDescription:
			"this machine holds a token for the organization's Turso account. forget it, and nothing here reaches that account.",
		forgetAccountRevokes:
			"forgetting does not revoke the token. end the grant yourself on Turso's dashboard at app.turso.tech.",
		forgetAccountRevokesAt: 'app.turso.tech',
		accountForgotten: 'this machine no longer holds a token for your Turso account.',
		deleteOrganization: 'delete organization',
		deleteOrganizationDescription:
			'the organization and every workspace in it are deleted from your Turso account. nothing puts them back.',
		deleteOrganizationGoes:
			'every workspace and every record in it is deleted, and every member loses their way in. nothing puts this back.',
		organizationDeleted: 'the organization was deleted.'
	},

	/**
	 * who each role is for, in one sentence apiece (effort 828, requirement 23).
	 *
	 * A role is described by the person it suits rather than by the acts it unlocks, which is
	 * what every product in the research does and what makes the chooser readable without the
	 * table beside it. The manager's names the one thing the word does not cover. A role the
	 * organization made is described by what it carries instead.
	 */
	roles: {
		owner: {
			who: 'holds the Turso account and can do anything. there is one owner, and only they can hand it over.'
		},
		manager: {
			who: "adds members, makes links and grants workspaces. the Turso account stays the owner's."
		},
		member: {
			who: 'works in the workspaces they hold, and changes nothing about anybody else unless you allow it.'
		}
	},

	/**
	 * what each flag is called where a role or a member's permissions list it (effort 838,
	 * requirement 12), grouped under its family. A record kind's four read as the verb alone,
	 * under the kind's name; the organization's and the owner's read as what the person does.
	 * The four verbs are the switch list's and a refusal's alike, so a create flag reads *add*
	 * everywhere it is named, and a role's card says them as what the role does
	 * (`roleCard.verbs`).
	 */
	families: {
		administration: 'the organization',
		owner: "the owner's own",
		complex: 'complexes',
		unit: 'units',
		tenant: 'tenants',
		contract: 'contracts',
		payment: 'payments'
	},
	flagVerbs: {
		view: 'view',
		create: 'add',
		edit: 'edit',
		delete: 'delete'
	},
	flags: {
		inviteMember: 'invite members',
		removeMember: 'remove members',
		assignRole: 'give members a role',
		renameWorkspace: 'rename workspaces',
		resetPassword: 'reset passwords',
		renameMember: 'rename members',
		grantWorkspace: 'grant workspaces',
		manageRoles: 'manage roles',
		overrideMember: "change one member's permissions",
		manageMark: "change the organization's mark",
		createWorkspace: 'create workspaces',
		deleteWorkspace: 'delete workspaces',
		mintReadOnly: 'grant read only access',
		lockOut: 'lock members out',
		renewCredentials: 'renew credentials',
		tursoAccount: 'connect the Turso account',
		transferOwnership: 'hand the organization over',
		deleteOrganization: 'delete the organization'
	},

	/**
	 * the roles block of the organization section, and the role editor it opens (effort 838,
	 * requirements 4 and 12).
	 */
	roleList: {
		title: 'roles',
		description:
			"what each kind of person may do, highest first. a member's own card can change it for them alone.",
		add: 'add a role',
		rank: 'rank',
		heldBy: 'held by {count|number} {{member|members}}',
		heldByNobody: 'nobody holds it yet',
		carriesNothing: 'nothing yet',
		moveUp: 'move up',
		moveDown: 'move down',
		highest: 'it is already just below the manager.',
		lowest: 'it is already just above the member.',
		notBelowYou: 'that role is not below your own.',
		newTitle: 'a new role',
		newDescription:
			'a name, and what everybody given it may do. it starts just above the member and moves from its card.',
		editDescription: 'what everybody holding {role:string} may do.',
		name: 'name',
		nameDescription: 'what the role is called on every card.',
		builtInName: 'every organization has this role, so its name stays.',
		flagsTitle: 'what it may do',
		create: 'add the role',
		deleteTitle: 'delete role',
		deleteDescription:
			'everybody holding it becomes a member, with exactly what the member role gives.',
		created: 'the role was added.',
		saved: 'the role was saved.',
		moved: 'the role was moved.',
		deleted: 'the role was deleted.'
	},

	/** what a member may do, on their card (effort 838, requirement 12). */
	// the three layers a member's card sets, each titled by where it reaches: the role, then
	// what is changed for them across the organization, then what is changed in one workspace.
	override: {
		legend: 'organization override',
		says: 'overrides their role, everywhere in the organization.',
		workspaces: 'workspace overrides',
		workspacesSays:
			'which workspaces they can open, and in each one, overrides of their organization permissions.'
	},

	/**
	 * the switch list a role's editor and a member's card share (effort 838, requirement 12 as
	 * amended 2026-09-27, and a fourth time 2026-09-28). Each kind of record and the
	 * organization is a group that folds to how many of its permissions are on, and opens to
	 * one row per permission with a line of what it allows (`verbSays`, and `flagSays` where a
	 * permission says more than its verb). On a member's card a switch that differs from their
	 * role is marked, and the member reads as custom.
	 */
	switches: {
		verbSays: {
			view: 'see them, in lists and on their own pages.',
			create: 'add new ones.',
			edit: 'change what they hold.',
			delete: 'remove them.'
		},
		flagSays: {
			editContract: 'change them, ending, renewing and restoring included.',
			inviteMember: 'bring new people into the organization.',
			removeMember: 'take people out of the organization.',
			assignRole: 'choose the role each member holds.',
			renameWorkspace: 'change what a workspace is called.',
			resetPassword: 'let a member who lost their password set a new one.',
			renameMember: "change a member's username.",
			grantWorkspace: 'put members in workspaces, or take them out.',
			manageRoles: 'add, edit, rank and delete roles.',
			overrideMember: 'give one member more or less than their role does.',
			manageMark: "set the signature or seal printed on the organization's pages."
		},
		viewFirst: 'turn view on first: adding, editing or deleting a record needs seeing it.',
		groupRefused: 'some of these are not yours to change',
		folded: '{count|number} of {total|number}',
		owner:
			'creating and deleting workspaces, the Turso account and handing over stay with the owner.',
		notHeld: 'a dimmed switch is one you do not hold yourself, so it is not yours to change.',
		writesNotHeld: 'turning this off turns off one beneath it that you do not hold yourself.',
		differs: 'differs from {role:string}',
		custom: 'custom',
		reset: 'reset to {role:string}',
		resetNotHeld: 'resetting would change a permission you do not hold yourself.'
	},

	/**
	 * the one line a role's card in the roles block says of what it can do (effort 838,
	 * requirement 12 as amended a fourth time, `organization/role.ts`'s `roleLine`): a clause
	 * per step, the verbs and the kinds on it, and whether it runs the organization.
	 * The kinds are named as a verb takes them, which in Arabic is not how a heading names them
	 * (`families`), so the line keeps its own.
	 */
	roleCard: {
		everything: 'full access to everything',
		full: 'full access to {kinds:string}',
		does: '{verbs:string} {kinds:string}',
		verbs: {
			view: 'views',
			create: 'adds',
			edit: 'edits',
			delete: 'deletes'
		},
		kinds: {
			complex: 'complexes',
			unit: 'units',
			tenant: 'tenants',
			contract: 'contracts',
			payment: 'payments'
		},
		everyRecord: 'every record',
		everyOtherRecord: 'every other record',
		organization: {
			all: 'runs the organization',
			some: 'helps run the organization'
		}
	},

	/**
	 * what a control on a role or a member's card says where its save would be refused (effort
	 * 838, requirements 6 and 7, ticket 45): the flag it would move that the reader does not
	 * hold, or the holders it would leave writing records they cannot view.
	 */
	foreseen: {
		roleMoves: 'this role changes whether they may {flag:string}, and you may not.',
		pinnedMoves: 'this role clears whether they may {flag:string} in a workspace, and you may not.',
		deleteMoves:
			'deleting it changes whether {username:string} may {flag:string}, and you may not.',
		holdersBlind:
			'{names:string} would add, edit or delete records they cannot view. reset them to this role on their card first.'
	},

	/**
	 * a member's workspaces on their card and on the sheet that adds them, and a workspace's
	 * people in its own dialog (effort 838, requirement 12 as amended a third time 2026-09-27,
	 * and a fourth time 2026-09-28): each a switch, in or out, and under one that is in on the
	 * card, its permissions folded, measured against what the member holds across the
	 * organization.
	 */
	workspaceSwitches: {
		permissions: 'permissions',
		permissionsSays:
			'what they may do in this workspace alone. a dot marks what differs from the rest of the organization.',
		differs: 'differs from the rest of the organization',
		customHere: 'custom here',
		movesNotHeld: 'this changes a permission here that you do not hold yourself.',
		notHeld: 'you hold this workspace read only, so you cannot give it.'
	}
} satisfies BaseTranslation;

export const layout = {
	accountMenu: {
		signedOutHint: 'not signed in',
		signedOutName: 'user'
	},

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
