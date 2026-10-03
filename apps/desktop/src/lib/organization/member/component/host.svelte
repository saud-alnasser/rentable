<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice } from '$lib/organization/access/access';
	import { useSetWorkspaceOverride, type useChangeAccess } from '$lib/organization/access/query';
	import { pinnedAcross } from '$lib/organization/access/access';
	import MemberSheet, { type MemberEdit } from '$lib/organization/member/component/sheet.svelte';
	import OfferOwnership from '$lib/organization/member/component/offer-ownership.svelte';
	import { memberWritesOf } from '$lib/organization/member/member';
	import {
		useAssignRole,
		useEndMemberSessions,
		useLockOutCost,
		useMakeMemberLink,
		useOfferOwnership,
		useRemoveMember,
		useRenameMember,
		useSetOverride,
		useUnsetMemberPassword,
		useWithdrawOffer
	} from '$lib/organization/member/query';
	import { showMadeLink } from '$lib/organization/dialogs.svelte';
	import { organizationHostState, type MemberPress } from '$lib/organization/host.svelte';
	import type {
		OrganizationMember,
		OrganizationRole,
		OrganizationSession
	} from '$lib/organization/host';
	import { untrack } from 'svelte';

	/**
	 * Every surface a member act opens, and every write one runs: the member's sheet, the handover,
	 * the removal, the link on the press, and the reset, the sign-out and the withdrawal once asked.
	 * Mounted by the organization host (`../../component/host.svelte`), which reads the session and
	 * the roles once for every part of it and resets what is here as it goes.
	 */
	let {
		session,
		roles,
		changeAccess,
		refetchState
	}: {
		/** the session the organization host reads, or `null` while it is being read. */
		session: OrganizationSession | null;
		/** the roles, read by the organization host while a surface that chooses or edits one is open. */
		roles: OrganizationRole[];
		/**
		 * the access write the member's sheet makes, read once by the organization host. A
		 * workspace's page writes through the same declaration from its own end.
		 */
		changeAccess: ReturnType<typeof useChangeAccess>;
		/** read where the machine stands again, after a write that moves it. */
		refetchState: () => Promise<unknown>;
	} = $props();

	const member = $derived(organizationHostState.member);

	const renameMember = useRenameMember();
	const assignRole = useAssignRole();
	const setOverride = useSetOverride();
	const setWorkspaceOverride = useSetWorkspaceOverride();
	const offerOwnership = useOfferOwnership();
	const withdrawOffer = useWithdrawOffer();
	const removeMember = useRemoveMember();
	const makeMemberLink = useMakeMemberLink();
	const unsetMemberPassword = useUnsetMemberPassword();
	const endMemberSessions = useEndMemberSessions();

	// ----- the member's sheet

	/** what each act refused the last save with, marked on the section that asked for it. */
	let nameRefusal = $state<string | null>(null);
	let roleRefusal = $state<string | null>(null);
	let overrideRefusal = $state<string | null>(null);
	let workspacesRefusal = $state<string | null>(null);
	let isRenaming = $state(false);

	const isSavingMember = $derived(
		isRenaming ||
			assignRole.isPending ||
			setOverride.isPending ||
			changeAccess.isPending ||
			setWorkspaceOverride.isPending
	);

	const openedOn = $derived(member.editing);
	/** whose sheet is open: a save that redraws it from what it wrote keeps the same one. */
	const openedFor = $derived(member.editing?.member.id ?? null);

	// a fresh sheet starts with nothing marked from the last one, and a sheet left open over a
	// refusal, redrawn from what did go through, keeps the refusal marked.
	$effect(() => {
		if (openedFor) {
			untrack(() => {
				nameRefusal = null;
				roleRefusal = null;
				overrideRefusal = null;
				workspacesRefusal = null;
			});
		}
	});

	/**
	 * the rows the sheet's workspaces draw: every workspace the reader holds, with what this member
	 * holds on it and what is set for them there, and whether the reader holds it at full access,
	 * which is what they can give.
	 */
	const memberRows = $derived(
		openedOn
			? (session?.workspaces ?? []).map((held) => {
					const grant = openedOn.member.workspaces.find((each) => each.id === held.id);

					return {
						id: held.id,
						name: held.name,
						access: (grant?.access ?? 'none') as AccessChoice,
						pinned: grant?.pinned ?? 0,
						granted: grant?.granted ?? 0,
						givable: held.accessLevel === 'full-access'
					};
				})
			: []
	);

	/**
	 * one save, and the acts that exist behind it.
	 *
	 * **Each act is asked for only where something changed**, and each refuses on its own: the name
	 * is one write, the role and the override another, and the grants write one workspace each. So
	 * a save refused one of them leaves the others written, which is what the acts do on their own
	 * and what the sentence on the section then says.
	 *
	 * **A role and an override changed together are one act** (ticket 14 of effort 838): the
	 * override rides with the role, so the flags the reader must hold are the ones the two move
	 * together, and neither is written without the other. A refusal of it marks both sections. An
	 * override changed alone, or by a reader who may not give roles, is its own write. **With a
	 * changed role, the override the switches come to is sent whenever it is not nothing**, even
	 * where it equals the one the member had: the shell clears what is not sent (ticket 45).
	 *
	 * **What is tailored per workspace is written last** (effort 838, requirement 12 as amended a
	 * third time), one write per workspace whose pins changed, carrying what is pinned there and
	 * which of it is on: after the role and the override, which clear every one where the role
	 * changes or the member is put back on it, and after the grants, since a workspace override is
	 * set only on a workspace the member is in. A workspace whose grant was refused is not
	 * tailored. A refusal marks the workspaces. **A clear that went through is counted on the
	 * sheet**, so one left open over a later refusal draws every workspace with nothing set.
	 *
	 * **A refusal keeps the sheet open and marks its section** ([[rules/interface]], *Validation
	 * errors*), rather than reaching the reader as a toast over a surface that has already closed.
	 * The shared handler still says it too; this is the copy the field carries.
	 */
	const saveMember = async (edit: MemberEdit) => {
		const record = member.editing;

		if (!record) return;

		const { member: saved, context } = record;
		// what the row holds once each write that went through is counted, which the sheet is
		// measured from again where one of them was refused and it stays open.
		let written = saved;

		nameRefusal = null;
		roleRefusal = null;
		overrideRefusal = null;
		workspacesRefusal = null;

		if (context.canRename && edit.username !== saved.username) {
			isRenaming = true;

			try {
				await renameMember.mutateAsync({ memberId: saved.id, username: edit.username });
				written = { ...written, username: edit.username };
			} catch (error) {
				nameRefusal = toErrorText(error, $LL);
			} finally {
				isRenaming = false;
			}
		}

		const writes = memberWritesOf(saved, edit, context);
		// another role, or a reset to the role, clears what is set in every workspace, as Rust
		// does in the same act.
		const unpinned = (member: OrganizationMember): OrganizationMember => ({
			...member,
			workspaces: member.workspaces.map((held) => ({ ...held, pinned: 0, granted: 0 }))
		});

		if (writes.assign) {
			const { override } = writes.assign;

			try {
				await assignRole.mutateAsync({
					memberId: saved.id,
					roleId: writes.assign.roleId,
					override
				});
				written = unpinned({
					...written,
					roleId: writes.assign.roleId,
					override: override ?? 0
				});
			} catch (error) {
				roleRefusal = toErrorText(error, $LL);
				overrideRefusal = override !== undefined ? roleRefusal : null;
			}
		} else if (writes.override !== null) {
			try {
				await setOverride.mutateAsync({ memberId: saved.id, override: writes.override });
				written = { ...written, override: writes.override };

				if (writes.override === 0) written = unpinned(written);
			} catch (error) {
				overrideRefusal = toErrorText(error, $LL);
			}
		}

		// a grant minted read-only that a write turned on lifts to full access goes after what is
		// pinned there: the pins are what keep its other writes off, so a pin refused leaves the
		// grant read-only rather than open to every write the member holds across the organization.
		const lifts = (change: (typeof edit.changes)[number]) =>
			change.access === 'full-access' &&
			saved.workspaces.some((held) => held.id === change.id && held.access === 'read-only');

		const grant = async (changes: typeof edit.changes) => {
			if (!context.canGrantWorkspace || changes.length === 0) return;

			try {
				await changeAccess.mutateAsync({
					changes: changes.map((change) => ({
						workspaceId: change.id,
						memberId: saved.id,
						access: change.access
					}))
				});
				// what went through is what a sheet left open is measured from: a workspace put in
				// is held, one taken out is not, and one lifted is held at its new level.
				written = {
					...written,
					workspaces: [
						...written.workspaces
							.filter((held) =>
								changes.every((change) => change.id !== held.id || change.access !== 'none')
							)
							.map((held) => {
								const change = changes.find((each) => each.id === held.id);

								return change && change.access !== 'none'
									? { ...held, access: change.access }
									: held;
							}),
						...changes
							.filter(
								(change) =>
									change.access !== 'none' &&
									written.workspaces.every((held) => held.id !== change.id)
							)
							.map((change) => ({
								id: change.id,
								access: change.access as 'full-access' | 'read-only',
								pinned: 0,
								granted: 0,
								permissions: written.permissions
							}))
					]
				};
			} catch (error) {
				workspacesRefusal ??= toErrorText(error, $LL);
			}
		};

		await grant(edit.changes.filter((change) => !lifts(change)));

		// each was measured against the role and the override the sheet saves, so a refusal of
		// either leaves nothing to measure it from; and a grant refused leaves its workspace as it
		// was, so nothing is tailored over it.
		const tailored =
			roleRefusal || overrideRefusal
				? []
				: edit.tailored.filter(
						(each) =>
							context.canOverride &&
							!(
								workspacesRefusal &&
								edit.changes.some((change) => change.id === each.id && !lifts(change))
							)
					);

		const unpinnable: string[] = [];

		for (const each of tailored) {
			try {
				await setWorkspaceOverride.mutateAsync({
					memberId: saved.id,
					workspaceId: each.id,
					pinned: each.pinned,
					granted: each.granted
				});
				written = {
					...written,
					workspaces: written.workspaces.map((held) =>
						held.id === each.id ? { ...held, pinned: each.pinned, granted: each.granted } : held
					)
				};
			} catch (error) {
				unpinnable.push(each.id);
				workspacesRefusal ??= toErrorText(error, $LL);
			}
		}

		await grant(edit.changes.filter((change) => lifts(change) && !unpinnable.includes(change.id)));

		if (!nameRefusal && !roleRefusal && !overrideRefusal && !workspacesRefusal) {
			organizationHostState.member.editing = null;
		} else if (written !== saved && organizationHostState.member.editing === record) {
			// left open over a refusal: what did go through is what the next save is measured
			// from, or undoing it on the sheet would compare equal to the stale row and send
			// nothing.
			organizationHostState.member.editing = { ...record, member: written };
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
	 * The link runs on the press, since it ends nothing and is shown once on the one panel that shows
	 * a link and a code. The reset, the sign-out from every machine and the withdrawal end something,
	 * so each runs from here once its question is answered (below). What each did is announced by
	 * its hook, the only place a toast is raised ([[rules/frontend]], *Data access*).
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

	// ----- the writes that end something, asked first

	const asking = $derived(member.asking);

	/** what each asks, under the member it is on: what ends, and what brings it back. */
	const askingCopy = $derived.by(() => {
		switch (asking?.kind) {
			case 'unsetPassword':
				return {
					act: $LL.organization.dashboard.unsetPassword(),
					description: $LL.organization.dashboard.unsetPasswordAsks()
				};
			case 'endSessions':
				return {
					act: $LL.organization.dashboard.endSessions(),
					description: $LL.organization.dashboard.endSessionsAsks()
				};
			case 'withdrawOffer':
			case undefined:
				return {
					act: $LL.organization.dashboard.withdrawOffer(),
					description: $LL.organization.dashboard.withdrawOfferAsks()
				};
		}
	});

	const confirmAsked = async () => {
		if (!asking) return;

		await runPressed(asking.kind, asking.record.member.id);
	};

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
		await refetchState();
	};
</script>

<MemberSheet
	open={member.editing !== null}
	onOpenChange={(open) => {
		if (!open && !isSavingMember) organizationHostState.member.editing = null;
	}}
	username={member.editing?.member.username ?? ''}
	roleId={member.editing?.member.roleId ?? ''}
	override={member.editing?.member.override ?? 0}
	pinned={pinnedAcross(member.editing?.member.workspaces ?? [])}
	{roles}
	rows={memberRows}
	readerRank={member.editing?.context.rank ?? 0}
	readerPermissions={member.editing?.context.permissions ?? 0}
	canRename={member.editing?.context.canRename ?? false}
	canAssignRole={member.editing?.context.canAssignRole ?? false}
	canOverride={member.editing?.context.canOverride ?? false}
	canGrantWorkspace={member.editing?.context.canGrantWorkspace ?? false}
	isSaving={isSavingMember}
	{nameRefusal}
	{roleRefusal}
	{overrideRefusal}
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

<!-- the reset, the sign-out from every machine and the withdrawal end something, so each asks
     first under its own verb, naming the member, what ends and what brings it back. -->
<ConfirmDialog
	open={asking !== null}
	onOpenChange={(open) => {
		if (!open) organizationHostState.member.asking = null;
	}}
	onSubmit={confirmAsked}
	record={asking?.record.member.username}
	title={askingCopy.act}
	description={askingCopy.description}
	confirmLabel={askingCopy.act}
	confirmLoadingLabel={$LL.common.actions.working()}
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
