import {
	declareMemberActs,
	declareWorkspaceActs,
	type MemberActId,
	type MemberActRecord,
	type MemberPending,
	type WorkspaceActId,
	type WorkspaceActRecord
} from '$lib/organization/acts';
import type { RecordAct } from '$lib/design/acts';
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

type OrganizationHostState = {
	member: {
		/** the member the sheet is open on, with what the reader may write of them. */
		editing: MemberActRecord | null;
		/** the owner's card the handover is open on. */
		offering: MemberActRecord | null;
		/** the member being asked about, and at which speed. */
		removing: { record: MemberActRecord; lockOut: boolean } | null;
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
		/** the workspace whose members are open. */
		changingAccess: WorkspaceActRecord | null;
		/** the workspace being asked about. */
		deleting: WorkspaceActRecord | null;
	};
};

const idle = (): OrganizationHostState => ({
	member: {
		editing: null,
		offering: null,
		removing: null,
		pressed: null,
		pending: {
			linking: null,
			unsetting: null,
			endingSessions: null,
			offering: false,
			withdrawing: false
		}
	},
	workspace: { editing: null, changingAccess: null, deleting: null }
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

/** Every member act, bound to this host. The one list every surface projects. */
export const memberActs = declareMemberActs({
	edit: (record) => {
		organizationHostState.member.editing = record;
	},
	offerOwnership: (record) => {
		organizationHostState.member.offering = record;
	},
	withdrawOffer: press('withdrawOffer'),
	makeLink: press('makeLink'),
	unsetPassword: press('unsetPassword'),
	endSessions: press('endSessions'),
	confirmRemoval: (record, lockOut) => {
		organizationHostState.member.removing = { record, lockOut };
	}
});

/** Every workspace act, bound to this host. */
export const workspaceActs = declareWorkspaceActs({
	edit: (record) => {
		organizationHostState.workspace.editing = record;
	},
	changeAccess: (record) => {
		organizationHostState.workspace.changingAccess = record;
	},
	confirmDelete: (record) => {
		organizationHostState.workspace.deleting = record;
	}
});

/** run one act on a record the caller holds, where the record admits it; says whether it ran. */
function runDeclared<T>(acts: readonly RecordAct<T>[], actId: string, record: T) {
	const act = acts.find((declared) => declared.id === actId);

	if (!act || !(act.appliesTo?.(record) ?? true)) {
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

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetOrganizationHost() {
	Object.assign(organizationHostState, idle());
}
