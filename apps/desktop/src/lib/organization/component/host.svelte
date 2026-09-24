<script lang="ts">
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/component/access-dialog.svelte';
	import MemberSheet, { type MemberEdit } from '$lib/organization/component/member-sheet.svelte';
	import OfferOwnership from '$lib/organization/component/offer-ownership.svelte';
	import { showMadeLink } from '$lib/organization/dialogs.svelte';
	import {
		organizationHostState,
		resetOrganizationHost,
		type MemberPress
	} from '$lib/organization/host.svelte';
	import {
		useChangeAccess,
		useChangeRole,
		useDeleteWorkspace,
		useEndMemberSessions,
		useFetchMembers,
		useFetchOrganizationState,
		useLockOutCost,
		useMakeMemberLink,
		useOfferOwnership,
		useRemoveMember,
		useRenameMember,
		useUnsetMemberPassword,
		useWithdrawOffer
	} from '$lib/organization/query';
	import WorkspaceRenameForm from '$lib/workspace/component/rename-form.svelte';
	import { onDestroy, untrack } from 'svelte';

	/**
	 * Every surface a member act or a workspace act opens, and every write one runs on the press,
	 * mounted once for the whole shell.
	 *
	 * The acts are two lists (`organization/acts.ts`), and the settings directories draw them as
	 * projections of those lists; what the acts open is here, the way a contract's acts open what
	 * `contract/component/host.svelte` holds. `organization/host.svelte.ts` is the request the
	 * directories raise and this answers.
	 *
	 * **The mutations are here**, inside the providers, so each reads the query client from context
	 * the way every other hook does. What they write, what each announces, and which surfaces stay
	 * open on a refusal are unchanged from when the settings route held them.
	 *
	 * **What an act was gated on travels with it.** The record a surface opens on carries what the
	 * reader may write of it, so the sheet draws the sections the card's gates allowed and nothing
	 * the reader's row does not carry; Rust refuses every one of them again on the signed row.
	 *
	 * **Drawn while a session is held**, which the frame decides; what is here on unmount is reset,
	 * so a surface left open at sign-out does not reopen on the next sign-in.
	 */
	const stateQuery = useFetchOrganizationState();

	const member = $derived(organizationHostState.member);
	const workspace = $derived(organizationHostState.workspace);

	const session = $derived(stateQuery.data?.session ?? null);

	// the members are read only while the one surface that lists them is open: the settings route
	// reads them already, so this is the same cache rather than a second request.
	const membersQuery = useFetchMembers(() => workspace.changingAccess !== null);

	const renameMember = useRenameMember();
	const changeRole = useChangeRole();
	const changeAccess = useChangeAccess();
	const offerOwnership = useOfferOwnership();
	const withdrawOffer = useWithdrawOffer();
	const removeMember = useRemoveMember();
	const makeMemberLink = useMakeMemberLink();
	const unsetMemberPassword = useUnsetMemberPassword();
	const endMemberSessions = useEndMemberSessions();
	const deleteWorkspace = useDeleteWorkspace();

	// ----- the member's sheet

	/** what each act refused the last save with, marked on the section that asked for it. */
	let nameRefusal = $state<string | null>(null);
	let roleRefusal = $state<string | null>(null);
	let workspacesRefusal = $state<string | null>(null);
	let isRenaming = $state(false);

	const isSavingMember = $derived(isRenaming || changeRole.isPending || changeAccess.isPending);

	const openedOn = $derived(member.editing);

	// a fresh sheet starts with nothing marked from the last one.
	$effect(() => {
		if (openedOn) {
			untrack(() => {
				nameRefusal = null;
				roleRefusal = null;
				workspacesRefusal = null;
			});
		}
	});

	/** the rows the sheet's workspaces draw: every workspace, with what this member holds on it. */
	const memberRows = $derived(
		openedOn
			? (session?.workspaces ?? []).map((held) => ({
					id: held.id,
					name: held.name,
					access: (openedOn.member.workspaces.find((grant) => grant.id === held.id)?.access ??
						'none') as AccessChoice
				}))
			: []
	);

	/**
	 * one save, and the acts that exist behind it.
	 *
	 * **Each act is asked for only where something changed**, and each refuses on its own: the name
	 * is one write, the role act writes the role and the column together, and the grants write one
	 * workspace each. So a save refused one of them leaves the others written, which is what the
	 * acts do on their own and what the sentence on the section then says.
	 *
	 * **A refusal keeps the sheet open and marks its section** ([[rules/interface]], *Validation
	 * errors*), rather than reaching the reader as a toast over a surface that has already closed.
	 * The shared handler still says it too; this is the copy the field carries.
	 */
	const saveMember = async (edit: MemberEdit) => {
		const record = member.editing;

		if (!record) return;

		const { member: saved, context } = record;

		nameRefusal = null;
		roleRefusal = null;
		workspacesRefusal = null;

		if (context.canRename && edit.username !== saved.username) {
			isRenaming = true;

			try {
				await renameMember.mutateAsync({ memberId: saved.id, username: edit.username });
			} catch (error) {
				nameRefusal = toErrorText(error, $LL);
			} finally {
				isRenaming = false;
			}
		}

		if (
			context.canChangeRole &&
			(edit.role !== saved.role || edit.permissions !== saved.permissions)
		) {
			try {
				await changeRole.mutateAsync({
					memberId: saved.id,
					role: edit.role,
					permissions: edit.permissions
				});
			} catch (error) {
				roleRefusal = toErrorText(error, $LL);
			}
		}

		if (context.canGrantWorkspace && edit.changes.length > 0) {
			try {
				await changeAccess.mutateAsync({
					changes: edit.changes.map((change) => ({
						workspaceId: change.id,
						memberId: saved.id,
						access: change.access
					}))
				});
			} catch (error) {
				workspacesRefusal = toErrorText(error, $LL);
			}
		}

		if (!nameRefusal && !roleRefusal && !workspacesRefusal) {
			organizationHostState.member.editing = null;
		}
	};

	// ----- the handover

	/** what the shell refused the last offer with, marked on the surface's password field. */
	let offerRefusal = $state<string | null>(null);

	/**
	 * the organization, offered once the surface has taken the owner's password (effort 828,
	 * requirement 22). Nothing about the reader changes on an offer, so the state is not read
	 * again; a refusal keeps the surface open and puts the sentence on the password.
	 */
	const offer = async (memberId: string, password: string) => {
		offerRefusal = null;
		organizationHostState.member.pending.offering = true;

		try {
			await offerOwnership.mutateAsync({ memberId, password });
			organizationHostState.member.offering = null;
		} catch (error) {
			offerRefusal = toErrorText(error, $LL);
		} finally {
			organizationHostState.member.pending.offering = false;
		}
	};

	// ----- the writes that run on the press

	/**
	 * one write asked for on a card's press, and the member it ran for marked while it runs.
	 *
	 * They run on the press rather than behind a question: the link is shown once on the one panel
	 * that shows a link and a code, the reset hands nothing over, the one question this effort asks
	 * before ending sessions is the reader's own, and the withdrawal undoes something the owner
	 * did. What each did is announced by its hook, the only place a toast is raised
	 * ([[rules/frontend]], *Data access*).
	 */
	const runPressed = async (kind: MemberPress, memberId: string) => {
		const { pending } = organizationHostState.member;

		try {
			switch (kind) {
				case 'makeLink':
					pending.linking = memberId;
					showMadeLink(await makeMemberLink.mutateAsync({ memberId }));
					break;
				case 'unsetPassword':
					pending.unsetting = memberId;
					await unsetMemberPassword.mutateAsync({ memberId });
					break;
				case 'endSessions':
					pending.endingSessions = memberId;
					await endMemberSessions.mutateAsync({ memberId });
					break;
				case 'withdrawOffer':
					pending.withdrawing = true;
					await withdrawOffer.mutateAsync();
					break;
			}
		} catch {
			// said by the shared handler.
		} finally {
			pending.linking = kind === 'makeLink' ? null : pending.linking;
			pending.unsetting = kind === 'unsetPassword' ? null : pending.unsetting;
			pending.endingSessions = kind === 'endSessions' ? null : pending.endingSessions;
			pending.withdrawing = kind === 'withdrawOffer' ? false : pending.withdrawing;
		}
	};

	// answered once and cleared first, so a write cannot be asked twice by the effect running again
	// while it waits. Untracked past the read, because the work writes state this would otherwise
	// start depending on.
	$effect(() => {
		const pressed = organizationHostState.member.pressed;

		if (!pressed) return;

		organizationHostState.member.pressed = null;
		untrack(() => void runPressed(pressed.kind, pressed.memberId));
	});

	// ----- the removal

	/**
	 * the removal being asked about. The lock-out's dialog waits for the cost to be read, because
	 * the number it states is the number the act uses.
	 */
	const removing = $derived(member.removing);

	const lockOutCost = useLockOutCost(() => (removing?.lockOut ? removing.record.member.id : null));

	const lockOutDescription = $derived.by(() => {
		const cost = lockOutCost.data;

		if (!removing?.lockOut || !cost) return $LL.organization.dashboard.lockOutReading();

		return $LL.organization.dashboard.lockOutDescription({
			count: cost.membersAffected,
			workspaces:
				cost.workspaces.map((held) => held.name).join(', ') ||
				$LL.organization.dashboard.noWorkspaces()
		});
	});

	const confirmRemoval = async () => {
		if (!removing) return;

		const { record, lockOut } = removing;

		// what the removal did is announced by the hook; the session is read again because a
		// lock-out rotates workspaces the reader may hold.
		await removeMember.mutateAsync({ memberId: record.member.id, lockOut });
		await stateQuery.refetch();
	};

	// ----- the workspaces

	/** the rows the access dialog draws for a workspace: everybody who could hold it. */
	const workspaceRows = $derived.by(() => {
		const opened = workspace.changingAccess;

		if (!opened) return [];

		return (membersQuery.data ?? [])
			.filter((candidate) => candidate.role !== 'owner' && candidate.id !== session?.memberId)
			.map((candidate) => ({
				id: candidate.id,
				name: candidate.username,
				access: (candidate.workspaces.find((held) => held.id === opened.workspace.id)?.access ??
					'none') as AccessChoice
			}));
	});

	const changeWorkspaceAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		const opened = workspace.changingAccess;

		if (!opened) return;

		try {
			await changeAccess.mutateAsync({
				changes: changes.map((change) => ({
					workspaceId: opened.workspace.id,
					memberId: change.id,
					access: change.access
				}))
			});
			organizationHostState.workspace.changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};

	/**
	 * a workspace deleted, once the confirm has asked: the database goes with it, so the session is
	 * read again to drop the row the rail's switcher is still drawing.
	 */
	const confirmDelete = async () => {
		const opened = workspace.deleting;

		if (!opened) return;

		await deleteWorkspace.mutateAsync({ workspaceId: opened.workspace.id });
		await stateQuery.refetch();
	};

	onDestroy(resetOrganizationHost);
</script>

<MemberSheet
	open={member.editing !== null}
	onOpenChange={(open) => {
		if (!open && !isSavingMember) organizationHostState.member.editing = null;
	}}
	username={member.editing?.member.username ?? ''}
	role={member.editing?.member.role ?? 'member'}
	permissions={member.editing?.member.permissions ?? 0}
	rows={memberRows}
	canRename={member.editing?.context.canRename ?? false}
	canChangeRole={member.editing?.context.canChangeRole ?? false}
	canGrantWorkspace={member.editing?.context.canGrantWorkspace ?? false}
	canGrantSigning={member.editing?.context.isOwner ?? false}
	canGrantReadOnly={member.editing?.context.isOwner ?? false}
	isSaving={isSavingMember}
	{nameRefusal}
	{roleRefusal}
	{workspacesRefusal}
	onSave={(edit) => void saveMember(edit)}
/>

<OfferOwnership
	open={member.offering !== null}
	onOpenChange={(open) => {
		if (!open && !member.pending.offering) {
			organizationHostState.member.offering = null;
			offerRefusal = null;
		}
	}}
	accounts={member.offering?.context.offerable ?? []}
	isOffering={member.pending.offering}
	errorMessage={offerRefusal}
	onOffer={(memberId, password) => void offer(memberId, password)}
/>

<!-- the ordinary removal asks once and says what it does not do: nothing on the member's machine is
     taken back. The lock-out asks with the cost read first, and names how many others stop
     syncing, because turso revokes per database and totally. -->
<DeleteDialog
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) organizationHostState.member.removing = null;
	}}
	onSubmit={confirmRemoval}
	record={removing?.record.member.username ?? ''}
	title={removing?.lockOut
		? $LL.organization.dashboard.removeAndLockOut()
		: $LL.organization.dashboard.remove()}
	description={removing?.lockOut
		? lockOutDescription
		: $LL.organization.dashboard.removeDescription()}
	confirmLabel={removing?.lockOut
		? $LL.organization.dashboard.removeAndLockOut()
		: $LL.organization.dashboard.remove()}
	confirmLoadingLabel={$LL.common.actions.working()}
	blockers={removing?.lockOut && !lockOutCost.data ? AWAITING_BLOCKERS : undefined}
/>

<!-- keyed on the workspace, because the form holds a draft of the name it opened on. -->
{#if workspace.editing}
	{#key workspace.editing.workspace.id}
		<WorkspaceRenameForm
			workspace={workspace.editing.workspace}
			open={workspace.editing !== null}
			onOpenChange={(value) => {
				if (!value) organizationHostState.workspace.editing = null;
			}}
		/>
	{/key}
{/if}

<AccessDialog
	open={workspace.changingAccess !== null}
	onOpenChange={(value) => {
		if (!value && !changeAccess.isPending) organizationHostState.workspace.changingAccess = null;
	}}
	title={$LL.organization.dashboard.workspaceAccessTitle()}
	description={$LL.organization.dashboard.workspaceAccessDescription({
		workspace: workspace.changingAccess?.workspace.name ?? ''
	})}
	rows={workspaceRows}
	canGrantReadOnly={session?.role === 'owner'}
	isSaving={changeAccess.isPending}
	onSave={(changes) => void changeWorkspaceAccess(changes)}
/>

<!-- the packaged confirm, which names what is lost before it offers anything destructive
     ([[rules/interface]], *Form surface*). Deleting a workspace deletes its database on Turso, and
     nothing anywhere puts it back. -->
<DeleteDialog
	open={workspace.deleting !== null}
	onOpenChange={(value) => {
		if (!value) organizationHostState.workspace.deleting = null;
	}}
	onSubmit={confirmDelete}
	record={workspace.deleting?.workspace.name ?? ''}
	title={$LL.organization.dashboard.deleteWorkspace()}
	description={$LL.organization.dashboard.deleteWorkspaceDescription()}
	confirmLabel={$LL.organization.dashboard.deleteWorkspace()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
