// The organization feature's strings in english, composed back into `i18n/en/index.ts` at
// `organization`, `common.refusals.host` and `common.actions`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale. The session's `layout`
// blocks are `session/i18n/en.ts`.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const organization = {
	// the one image the organization prints at the foot of its pages (effort 835).
	mark: {
		alt: 'the organization stamp',
		choose: 'choose image',
		description: 'printed at the foot of every receipt and schedule.',
		none: 'none added yet',
		readOnly: 'somebody allowed to change the organization stamp can change it.',
		remove: 'remove',
		// the remove on the stamp's corner and the question before it: what goes, and what brings it
		// back.
		removeDescription:
			'receipts and schedules print without it, on every machine. only choosing an image again brings one back.',
		removeTitle: 'remove organization stamp',
		removed: 'organization stamp removed',
		replace: 'replace image',
		saved: 'organization stamp saved',
		title: 'organization stamp'
	},
	setup: {
		connectTitle: 'connect Turso',
		connectDescription: 'your organization is stored in your Turso account.',
		position: 'step {step|number} of {total|number}',
		openDashboard: 'open Turso dashboard',
		connect: 'connect',
		connectHint: 'your browser opens so you can allow access.',
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
		nameDescription: "you'll sign in with this username and password.",
		nameLabel: 'organization name',
		usernameLabel: 'username',
		nameRequired: 'give the organization a name.',
		nameTooLong: 'that name is too long.',
		passwordLabel: 'password',
		passwordFloor: 'at least 12 characters.',
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
		title: 'join with a link',
		description: 'paste the link and enter the code you were given.',
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
		passwordTitle: 'choose a password',
		passwordDescription: "you'll use it to sign in. it can't be recovered.",
		organizationLabel: 'organization',
		codeLabel: 'code',
		codeDescription: '6 characters.',
		codeWrong: 'the code is wrong. ask whoever sent you the link to read it out again.',
		codeMissing: 'type the six characters that came with the link.',
		confirmLabel: 'confirm password',
		mismatch: 'the two do not match.',
		continue: 'continue',
		tryAgain: 'try again',
		back: 'back'
	},
	// the sync group at the top of the organization section: where this machine stands with the
	// organization on Turso, as one of five named states each in a tone of its own (effort 846,
	// requirement 12, which brings back the coloured word effort 828 retired), and when it last
	// reached Turso on a line of its own. The control is named "sync", as the human named it on
	// 2026-09-17.
	standing: {
		// the group's title and its one line, the same whatever the state: what the group is
		// about.
		title: 'this machine and Turso',
		purpose:
			'the organization lives on Turso and reaches this machine on its own. what you write goes out when Turso is reachable.',
		// the five states, a word or two each, read at a glance; the explanation, where one is
		// owed, is a callout beneath.
		state: {
			upToDate: 'up to date',
			syncing: 'syncing',
			// a machine that has never reached Turso: a fresh machine opened offline, which is
			// not up to date. *It read "up to date" until review round two of effort 828.*
			notYetReached: 'not yet reached',
			needsAttention: 'needs attention',
			needsReconnecting: 'needs reconnecting'
		},
		// the moment of the last reach: relative within a day, the date and the time beyond it.
		lastReachedRecently: 'last reached Turso {moment:string}',
		lastReached: 'last reached Turso on {moment:string}',
		// an owner whose machine holds no authority: the reconnect is the leaving card's Turso account
		// row, and the sync group points at it by name rather than drawing a second consent (effort
		// 846, ticket 38).
		reconnectOnAccount: 'reconnect the Turso account under leaving.',
		checkNow: 'sync',
		// what folds under the state: the workspace this machine keeps a copy of, and where the copy
		// is (effort 846, *Detail that few readers need folds under its row*).
		detail: {
			label: 'what this machine keeps',
			workspace: 'workspace',
			copy: 'copy on this machine'
		}
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
		// what a workspace card says beyond its name (effort 846, requirement 16): that it is the
		// one open on this machine, and what the reader may do there, as what they may do rather
		// than as a level of access, which the member's card never names either.
		workspaceOpenHere: 'open on this machine',
		workspaceYouOwn: 'owner',
		workspaceYouEdit: 'you may edit',
		workspaceYouRead: 'you may read',
		workspaceSetForYou: 'set for you',
		// what a workspace's tile says under its heading, as fields each with its name small above
		// its value (effort 846, ticket 45): who holds it, named by the term's one key
		// `organization.dashboard.membersTitle`, then the reader's access and the day it was made.
		// Nobody holding it is said in words, never as a zero.
		workspaceCard: {
			memberCount: '{count|number}',
			noMembers: 'nobody',
			access: 'your access',
			created: 'created'
		},
		// what a member's tile says, as four fields each with its name small above its value
		// (effort 846, ticket 37): a name is written because four short values side by side need
		// one to be told apart. Where the account stands is a fact about it and nothing follows
		// from it: a link is offered whatever the password and machine fields say. A count of
		// nothing is said in words, never as a zero.
		memberCard: {
			password: 'password',
			passwordSet: 'set',
			noPassword: 'not yet',
			machine: 'machine',
			signedIn: 'signed in',
			noMachine: 'none',
			// the workspaces field is named by the term's one key, `settings.section.workspaces`.
			workspaceCount: '{count|number}',
			noWorkspaces: 'none',
			joined: 'joined',
			ownPermissions: 'permissions of their own',
			offered: 'offered the organization'
		},

		memberTitle: 'a new member',
		memberDescription:
			'a username, a role and the workspaces they hold. no password until they open a link you make.',
		role: 'role',
		noWorkspaceToGrant: 'no workspace to grant yet. they can be granted one later.',
		// a workspace's page with nobody to list: the owner and the reader are not.
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
		transferOwnership: 'transfer ownership',
		transferOwnershipGoes:
			'they are offered the organization. once they accept, they become the owner and you become a manager.',
		transferOwnershipMember: 'who is offered the organization',
		transferOwnershipAuthority:
			'your Turso account and its databases stay yours. the new owner connects their own before creating workspaces.',
		transferOwnershipConfirm: 'offer it',
		ownershipOffered: 'the organization was offered. they accept it on a machine of their own.',
		withdrawOffer: 'withdraw the offer',
		// what each member act that ends something says before it runs (effort 846, requirement 2).
		withdrawOfferAsks:
			'the offer ends and nothing changes hands. you can offer the organization again.',
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
		unsetPasswordAsks:
			'their password stops working on every machine. a link you make them lets them choose a new one.',
		passwordUnset: 'their password was unset. make them a link so they can choose a new one.',
		endSessions: 'sign out everywhere',
		endSessionsAsks: 'they are signed out of every machine. signing in again brings them back.',
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
		// the Turso account row's state on this machine, and the act that reconnects it.
		authorityConnected: 'connected on this machine',
		authorityNotHeld: 'not held here',
		// what folds under the connected row: the organization's own database on the account, and
		// the organization it holds (effort 846).
		authorityDetail: {
			label: 'what the Turso account holds',
			database: 'organization database',
			organization: 'organization'
		},
		reconnect: 'reconnect',
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
		accessFull: 'full access',
		// the line under the workspaces on the sheet that adds a member.
		memberWorkspacesDescription: 'the workspaces they can open. switch one on to let them in.',
		accessSaved: 'the workspaces were saved.',
		workspaceAccessDescription:
			'who can open {workspace:string}. find a member to let them in. access taken back lasts until it runs out.',
		deleteWorkspace: 'delete workspace',
		deleteWorkspaceDescription:
			'the workspace and every record in it are deleted from Turso and from every machine that syncs it. nothing puts it back.',
		workspaceDeleted: 'the workspace was deleted.',
		forgetAccount: 'forget Turso account',
		// the end row's button, which its row's name labels.
		forget: 'forget',
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
		// the leaving card's one line, the same for the owner and the member.
		leavingDescription: 'how you step away from the organization.',
		disconnectForgets:
			"signs you out and deletes the organization's copy on this machine. nothing on Turso changes.",
		// effort 846, requirement 14: what each act in the leaving group ends, one line apiece, and
		// the member's says how they come back, since a link is the only way back a member has.
		disconnectThisMachine: 'disconnect this machine',
		disconnectComesBack:
			"signs you out and deletes the organization's copy on this machine. it stays on Turso, and a new link brings you back.",
		transfer: 'transfer',
		transferGoes:
			'the member you choose becomes the owner once they accept, and you stay on as a manager.',
		withdraw: 'withdraw',
		offerStandsGoes: 'an offer stands. nothing changes hands until it is accepted.',
		// why the handover is refused where nobody could accept it: an account with no password of its
		// own has no vault for the organization's next key, and the owner's own is not a choice.
		nobodyOfferable: 'nobody has set a password yet, so nobody can take it.',
		disconnect: 'disconnect',
		disconnected: 'this machine no longer holds the organization.',
		forgetAccountDescription:
			"this machine holds a token for the organization's Turso account. forget it, and nothing here reaches that account.",
		// the forget confirmation: what it leaves standing, where to end it, and what brings it back
		// (effort 846, requirement 2).
		forgetAccountRevokes:
			'forgetting does not revoke the token. end it at app.turso.tech. connecting the Turso account again brings it back.',
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
		manageMark: 'change the organization stamp',
		createWorkspace: 'create workspaces',
		deleteWorkspace: 'delete workspaces',
		mintReadOnly: 'grant read only access',
		lockOut: 'lock members out',
		renewCredentials: 'renew credentials',
		tursoAccount: 'connect the Turso account',
		transferOwnership: 'transfer the organization',
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
			manageMark: 'set the organization stamp printed on its pages.'
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
	 * requirement 12 as amended a fourth time, `organization/role/role.ts`'s `roleLine`): a clause
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
		},
		/** how many hold the role, in the badge beside its name; nobody is said in words. */
		holders: '{count|number} {{member|members}}',
		noHolders: 'nobody yet',
		/** the four fields under a role's name: what each counts, and what it says. */
		fields: {
			reads: 'reads',
			changes: 'changes',
			people: 'people',
			organization: 'organization'
		},
		kindsOf: '{held|number} of {total|number} kinds',
		noKinds: 'nothing',
		everyAct: 'every act',
		actsOf: '{held|number} of {total|number} acts',
		noActs: 'none'
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
	},

	/**
	 * a workspace's own page (effort 846, tickets 49 and 50): the field that finds a member and
	 * puts them in, the cards of who is in, and the acts each card offers on this workspace.
	 */
	workspacePage: {
		addPlaceholder: 'find a member to add',
		searchPlaceholder: 'search by username',
		noMatch: 'nobody by that name to add.',
		nobodyToAdd: 'everybody is in this workspace',
		nobodyHolds: 'nobody is in this workspace yet.',
		openMember: 'open member',
		tailorHere: 'tailor access here',
		removeFromWorkspace: 'remove from workspace',
		removeAsks:
			'they can no longer open this workspace once the access they hold runs out. adding them again gives it back.'
	}
} satisfies BaseTranslation;

// what the shell says, by the reason a Rust refusal carries (`$lib/error/tauri`): every reason but
// a kind's refusal of a write without its view, which the index writes beside these. Its own
// message is a developer's description; this is what the reader is told.
export const refusals = {
	host: {
		lapsed: 'this link has lapsed. ask whoever sent it for a new one.',
		consumed: 'this link was already used. ask whoever sent it for a new one.',
		revoked: 'this link was withdrawn. ask whoever sent it for a new one.',
		replaced: 'a newer link replaced this one. ask whoever sent it for the new one.',
		codeMissing: 'type the six-character code that came with the link.',
		codeWrong: 'the code is wrong. ask whoever sent the link to read it out again.',
		linkUnreadable: 'this is not a rentable join link. copy the whole link and try again.',
		linkNotAnInvitation:
			'this link connects another machine rather than inviting you. sign in with your username and password instead.',
		linkNotForAMachine:
			'this link is an invitation rather than a link for another machine. open it where you accept an invitation.',
		anotherOrganizationHeld:
			'this machine already holds another organization. disconnect it first.',
		credentialsWrong: 'the username or password is wrong.',
		passwordTooShort: 'the password needs at least 12 characters.',
		passwordChangeRequired: 'change your password before doing anything else.',
		signedOut: 'nobody is signed in on this machine. sign in and try again.',
		noOrganization: 'this machine holds no organization yet.',
		noMemberYet: 'nobody has signed in to the organization on this machine yet. sign in first.',
		signInAgain: 'your account on this machine is out of date. sign in again.',
		youWereRemoved: 'you were removed from this organization.',
		sessionsEnded: 'your sessions were ended from another machine. sign in again.',
		keyNotInForce: 'the organization was handed over, so only its new owner can do this.',
		machineMissing: 'that machine is no longer signed in as you. reload to see what changed.',
		machineNotUpdated:
			'that machine has not run this version yet, so it is not signed out alone. sign out others instead.',
		usernameInvalid:
			'a username is 3 to 32 letters, digits, dots, underscores or hyphens, with no spaces.',
		usernameTaken: 'that username is already taken in this organization. choose another.',
		roleUnknown: 'choose one of the roles the organization has.',
		memberMissing: 'that member is no longer in this organization. reload to see what changed.',
		markNotAnImage: 'choose a PNG, JPEG or WebP image.',
		markTooLarge: 'the image is over 512 KB. choose a smaller one.',
		memberGone: 'this account is no longer in the organization.',
		memberRemoved: 'that member was removed. make them an account again if they are to come back.',
		notYourself: 'you cannot do this to your own account. somebody who ranks above you can.',
		ownerProtected: "the owner's account is not changed this way. the organization is theirs.",
		ownerOnly: 'only the owner can do this. ask the owner.',
		ownerMachineOnly:
			"this needs the Turso account, which is connected on the owner's machine. ask the owner.",
		roleLacksAct: 'your role does not include this. ask a manager.',
		notAdministrator: 'only a manager can do this.',
		rankNotAbove: 'that role is not below your own. ask somebody who ranks above it.',
		roleUnsettled:
			"somebody not allowed to changed this member's record. somebody above them removes them and makes them an account again.",
		roleBuiltIn:
			"every organization has this role, so it is not renamed, moved or deleted. the owner's role always carries everything.",
		roleNameMissing: 'give the role a name.',
		roleNameTaken: 'another role has that name. choose a different one.',
		roleOutOfPlace: 'a role goes below the manager and above the member.',
		noRankBelow: 'there is no room left below your role. ask somebody who ranks above you.',
		ownerRoleNotAssigned: "the owner's role moves only when the owner hands the organization over.",
		recordFlagsOnly:
			'a workspace changes only what may be done to its records. set the rest across the organization.',
		alreadyOwner: 'you are the owner already. choose the account that is to have it.',
		accountNotSetUp:
			'that account has no password of its own yet. once they open their link and choose one, offer it again.',
		offerPending: 'the organization is already offered to an account. withdraw that offer first.',
		offerAccepted:
			'the offer was already accepted, and the organization is theirs now. nothing was changed.',
		nothingOffered: 'no offer of this organization stands.',
		offererGone: 'the account that offered you the organization is no longer in it.',
		organizationNameMissing: 'the organization needs a name.',
		workspaceNameMissing: 'the workspace needs a name.',
		workspaceMissing:
			'that workspace is no longer in this organization. reload to see what changed.',
		noWorkspaceOpen: 'no workspace is open on this machine. open one and try again.',
		noGrant: 'you have no access to that workspace.',
		grantMissing: 'that member has no access to that workspace.',
		grantBeyondOwn: 'you can share only a workspace you have full access to yourself.',
		noOrganizationCredential:
			"this machine holds no access to the organization's records. sign in again and try once more.",
		workspaceNewer:
			'a newer version of rentable upgraded this workspace. update rentable to open it.',
		workspaceBehind:
			'this workspace needs upgrading, and read-only access cannot do it. ask a member with full access to open it once.',
		workspaceNeedsOpening:
			'this workspace is behind this version of rentable. open it once on this machine to bring it up to date.',
		databaseRefused: 'the database refused the request, and nothing was changed. try again later.',
		organizationOlder:
			'an older version made this organization. it waits for its owner to open it in this version, which upgrades it.',
		organizationUpgradeOffline:
			'upgrading this organization needs a connection. connect to the internet and sign in again; nothing was changed.',
		organizationChangesUnsendable:
			'this machine holds unsent changes the upgraded organization cannot take. disconnect it and connect again to drop them.',
		organizationCredentialLapsed:
			"this machine's access to the organization has lapsed. ask your organization for a new link to connect it again.",
		organizationNewer:
			'a newer version of rentable made this organization. update rentable to open it.',
		copyNotTaken:
			'no copy was taken before upgrading, so nothing was changed. check the connection and the backups folder, then try again.',
		shapeNotAsBuilt:
			'the upgrade failed its check, so nothing was changed. update rentable and try again; the diagnostics log says why.',
		tursoNotConnected:
			'this machine is not connected to the Turso account. connect it and try again.',
		consentNeededAgain: 'Turso needs the consent granted again. connect the Turso account again.',
		consentGone: 'this consent is no longer waiting. start it again.',
		groupMismatch:
			'that is not the group the consent was given over. check the name and try again.',
		groupNeeded: 'Turso needs the name of the group you picked. type it below.',
		groupHoldsOrganization:
			'that group already holds an organization. pick another group or another Turso account.',
		groupEmpty:
			'the consent was given over a group that holds no organization. give it over the group that holds yours.',
		nothingToConnectTo:
			'this Turso account holds no organization to connect to. go back and make one.',
		createRefused: "Turso would not create the organization's database.",
		tursoRefused: 'Turso refused the request. trying again will not help.',
		tursoAccountRefused:
			"Turso refused the request because of the account itself. check the account's plan in Turso."
	}
} satisfies BaseTranslation;

// the setup walk's connect and join controls, composed back at `common.actions`.
export const common = {
	actions: {
		connect: 'connect',
		join: 'join'
	}
} satisfies BaseTranslation;
