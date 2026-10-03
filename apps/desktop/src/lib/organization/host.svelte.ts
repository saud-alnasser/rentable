import {
	declareMemberActs,
	type MemberActId,
	type MemberActRecord,
	type MemberPending
} from '$lib/organization/member/acts';
import {
	declareRoleActs,
	type RoleActId,
	type RoleActRecord,
	type RolePending
} from '$lib/organization/role/acts';
import {
	declareHolderActs,
	declareWorkspaceActs,
	type HolderActRecord,
	type WorkspaceActId,
	type WorkspaceActRecord
} from '$lib/organization/workspace/acts';
import { goto } from '$app/navigation';
import { mayRun, type RecordAct } from '$lib/act';
import { memberCardOf } from '$lib/organization/member/address';
import { workspacePageOf } from '$lib/organization/workspace/address';
import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';

/**
 * THE ORGANIZATION HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * Every surface a member act or a workspace act opens, and every write one of them runs on the
 * press, is mounted once in the frame by `organization/component/host.svelte`. The directories in
 * settings ask for them here, the way `contract/host.svelte.ts` is asked for a contract's, and the
 * host answers: a directory draws cards and mounts nothing an act opens.
 *
 * *The two directories mounted their own sheets and dialogs, and the settings route handed each a
 * callback per act; the route owned the removal's confirm because it reads a query.*
 */

/** A member act that runs on the press: the host runs the write and says what came of it. */
export type MemberPress = 'makeLink' | 'unsetPassword' | 'endSessions' | 'withdrawOffer';

/**
 * A member act that ends something and so asks first, in the confirm dialog, before the host runs
 * its write ([[rules/interface]], *Delete and confirm*): the reset, the sign-out from
 * every machine and the withdrawal of an offer.
 */
export type MemberAsk = Exclude<MemberPress, 'makeLink'>;

type OrganizationHostState = {
	member: {
		/** the member the sheet is open on, with what the reader may write of them. */
		editing: MemberActRecord | null;
		/**
		 * the workspace whose permissions the sheet opens on, where it was opened to tailor them
		 * there from the workspace's page (effort 846, ticket 50), or `null`.
		 */
		tailoring: string | null;
		/** the owner's card the handover is open on. */
		offering: MemberActRecord | null;
		/** the member being asked about, and at which speed. */
		removing: { record: MemberActRecord; lockOut: boolean } | null;
		/** a write that ends something, being asked about before it runs. */
		asking: { kind: MemberAsk; record: MemberActRecord } | null;
		/** a write asked for on the press, waiting for the host to run it. */
		pressed: { kind: MemberPress; memberId: string } | null;
		/** the member each write is running for, while it runs. */
		pending: {
			linking: string | null;
			unsetting: string | null;
			endingSessions: string | null;
			offering: boolean;
			withdrawing: boolean;
		};
	};
	workspace: {
		/** the workspace whose name is open. */
		editing: WorkspaceActRecord | null;
		/** the workspace being asked about. */
		deleting: WorkspaceActRecord | null;
		/** the member a workspace is being taken back from, being asked about. */
		removing: HolderActRecord | null;
		/** the workspace whose file was asked for, waiting for the host to write it. */
		exporting: WorkspaceActRecord | null;
		/** the workspace a file is being read into, while its import is open. */
		importing: WorkspaceActRecord | null;
	};
	role: {
		/** the role the editor is open on. */
		editing: RoleActRecord | null;
		/** whether the editor is open on a role not made yet. */
		creating: boolean;
		/** the role being asked about. */
		deleting: RoleActRecord | null;
		/** a move asked for on the press, waiting for the host to run it. */
		moving: { roleId: string; afterRoleId: string } | null;
		/** whether a move is running. */
		pending: RolePending;
	};
};

const idle = (): OrganizationHostState => ({
	member: {
		editing: null,
		tailoring: null,
		offering: null,
		removing: null,
		asking: null,
		pressed: null,
		pending: {
			linking: null,
			unsetting: null,
			endingSessions: null,
			offering: false,
			withdrawing: false
		}
	},
	workspace: {
		editing: null,
		deleting: null,
		removing: null,
		exporting: null,
		importing: null
	},
	role: { editing: null, creating: false, deleting: null, moving: null, pending: { moving: false } }
});

export const organizationHostState = $state<OrganizationHostState>(idle());

/** what is in flight, as the member acts read it to refuse a second press. */
export function memberPending(): MemberPending {
	const { pending } = organizationHostState.member;

	return {
		linking: pending.linking !== null,
		unsetting: pending.unsetting !== null,
		endingSessions: pending.endingSessions !== null,
		offering: pending.offering,
		withdrawing: pending.withdrawing
	};
}

const press = (kind: MemberPress) => (record: MemberActRecord) => {
	organizationHostState.member.pressed = { kind, memberId: record.member.id };
};

const ask = (kind: MemberAsk) => (record: MemberActRecord) => {
	organizationHostState.member.asking = { kind, record };
};

/** Every member act, bound to this host. The one list every surface projects. */
export const memberActs = declareMemberActs({
	edit: (record) => {
		organizationHostState.member.editing = record;
		organizationHostState.member.tailoring = null;
	},
	offerOwnership: (record) => {
		organizationHostState.member.offering = record;
	},
	withdrawOffer: ask('withdrawOffer'),
	makeLink: press('makeLink'),
	unsetPassword: ask('unsetPassword'),
	endSessions: ask('endSessions'),
	confirmRemoval: (record, lockOut) => {
		organizationHostState.member.removing = { record, lockOut };
	}
});

/** Every workspace act, bound to this host. */
export const workspaceActs = declareWorkspaceActs({
	edit: (record) => {
		organizationHostState.workspace.editing = record;
	},
	// who holds a workspace is its own page (effort 846, ticket 49), so the act goes there.
	changeAccess: (record) => {
		void goto(workspacePageOf(record.workspace.id));
	},
	confirmDelete: (record) => {
		organizationHostState.workspace.deleting = record;
	},
	exportFile: (record) => {
		organizationHostState.workspace.exporting = record;
	},
	importFile: (record) => {
		organizationHostState.workspace.importing = record;
	}
});

/**
 * Every act on a member from a workspace's page, bound to this host (effort 846, ticket 50). The
 * tailoring is the member's sheet, opened on that workspace's permissions; the removal asks first,
 * in the workspace's host.
 */
export const holderActs = declareHolderActs({
	open: (record) => {
		void goto(memberCardOf(record.holder.member.id));
	},
	tailor: (record) => {
		organizationHostState.member.editing = record.holder;
		organizationHostState.member.tailoring = record.workspace.id;
	},
	confirmRemove: (record) => {
		organizationHostState.workspace.removing = record;
	}
});

/** Every role act, bound to this host. */
export const roleActs = declareRoleActs({
	edit: (record) => {
		organizationHostState.role.editing = record;
	},
	move: (record, afterRoleId) => {
		organizationHostState.role.moving = { roleId: record.role.id, afterRoleId };
	},
	confirmDelete: (record) => {
		organizationHostState.role.deleting = record;
	}
});

/** what is in flight, as the role acts read it to refuse a second press. */
export function rolePending(): RolePending {
	return { moving: organizationHostState.role.pending.moving };
}

/** run one act on a record the caller holds, where the record admits it; says whether it ran. */
function runDeclared<T>(acts: readonly RecordAct<T>[], actId: string, record: T) {
	const act = acts.find((declared) => declared.id === actId);

	if (!mayRun(act, record)) {
		return false;
	}

	act.run(record);

	return true;
}

export const memberHost = {
	/** run one act on a member. An act the member does not admit is not run. */
	run: (actId: MemberActId, record: MemberActRecord) => runDeclared(memberActs, actId, record),
	/** open the form that makes an account, mounted once in the shell. */
	create: () => openOrganizationDialog('account')
};

export const workspaceHost = {
	/** run one act on a workspace. An act the workspace does not admit is not run. */
	run: (actId: WorkspaceActId, record: WorkspaceActRecord) =>
		runDeclared(workspaceActs, actId, record),
	/** open the form that names a new workspace, mounted once in the shell. */
	create: () => openOrganizationDialog('workspace')
};

export const roleHost = {
	/** run one act on a role. An act the role does not admit is not run. */
	run: (actId: RoleActId, record: RoleActRecord) => runDeclared(roleActs, actId, record),
	/** open the role editor on a role not made yet. */
	create: () => {
		organizationHostState.role.creating = true;
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetOrganizationHost() {
	Object.assign(organizationHostState, idle());
}
