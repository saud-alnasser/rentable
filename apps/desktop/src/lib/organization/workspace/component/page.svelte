<script lang="ts">
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toCardActions, toPageActions } from '$lib/act';
	import DiscIcon from '$lib/design/cell/disc.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { toErrorText } from '$lib/error/message';
	import { accessRefusalOf, isTailored } from '$lib/organization/access/access';
	import { useChangeAccess } from '$lib/organization/access/query';
	import {
		holderActs,
		holderHost,
		memberPending,
		workspaceActs
	} from '$lib/organization/host.svelte';
	import { memberReaderOf, toMemberActContext } from '$lib/organization/member/acts';
	import { useFetchMembers, useFetchMemberStandings } from '$lib/organization/member/query';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { lacking } from '$lib/organization/role/acts';
	import { memberRoleName } from '$lib/organization/role/role';
	import { workspaceContextOf, type WorkspaceActRecord } from '$lib/organization/workspace/acts';
	import {
		holderCardOf,
		workspacePageOf,
		workspacesSection
	} from '$lib/organization/workspace/address';
	import { recordOf } from '$lib/settings';
	import { holderCount, workspaceAccessOf } from '$lib/organization/workspace/standing';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { lockedRefusal } from '$lib/organization/locked';
	import { permits } from '@rentable/workspace-permission';
	import AddSheet, { type HolderCandidate } from './add-sheet.svelte';
	import Holders, { type HolderCard } from './holders.svelte';

	/**
	 * A workspace's own page (effort 846, ticket 49), the way a complex or a tenant has one: what
	 * the workspace is at the top, and who holds it below.
	 *
	 * **The record surface's shell** (`block/record-surface.svelte`): back, the acts, the eyebrow
	 * and the name, the identity line, the fields, then the one collection under its heading. Back
	 * returns to the workspaces section the page is listed in, which the fallback names
	 * (`backTarget`): the settings area is one screen on the trail whichever section was left.
	 *
	 * **At the top, what the card says**, read through the same functions (`../standing.ts`): the
	 * *open on this machine* badge after its disc on the one open here, then the fields with the
	 * card's glyphs, how many hold it, what the reader may do there, and the day it was made where
	 * the row says. **The acts are the card's** (`workspace/acts.ts`, projected by
	 * `toPageActions`), refused as there, save *members*, which is this page. What each opens is
	 * the organization host's, mounted in the frame; the one form the page mounts is its own add
	 * sheet, below.
	 *
	 * **Below, who holds it, as a record directory** (ticket 51): the settings directories' tray
	 * over the holders' member cards (`./holders.svelte`), each with its menu of the acts on them
	 * here (`declareHolderActs`). The tray's plus opens the add sheet (`./add-sheet.svelte`), which
	 * this page mounts since it holds who can be put in: one list of them to check (ticket 52), and
	 * one save that grants every member checked through the one access write the member's card
	 * makes (`useChangeAccess`), a refusal staying in the sheet with the members it did not put in
	 * still checked. Pressing a card goes to this page with the
	 * member named on it, which is consumed on arrival by running *edit permissions* on them, as
	 * the members directory consumes a member named on its own address. *Who held a workspace was a
	 * dialog of switches under one save until ticket 49, a tile per member with a large switch
	 * until ticket 50, a field that put one member in at once until ticket 51, and a dropdown
	 * beside a list of the chosen until ticket 52.*
	 *
	 * **Who is listed or offered is decided here**: never the owner, whose grant is never withdrawn,
	 * and never the reader, who does not write their own row. Rust refuses both again, and every grant and
	 * withdrawal is checked again on the signed row whatever this page draws.
	 *
	 * **A workspace the reader holds no grant on is not there**: the session carries the
	 * workspaces the reader holds, which is every card the section draws, so an id outside it says
	 * so, with the way back.
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);
	const syncQuery = useFetchRemoteSyncState(() => session !== null);
	const membersQuery = useFetchMembers();
	const standingsQuery = useFetchMemberStandings();
	const changeAccess = useChangeAccess();

	const workspace = $derived(session?.workspaces.find((held) => held.id === workspaceId) ?? null);
	const openWorkspaceId = $derived(syncQuery.data?.workspace.remoteId ?? null);
	const isOpenHere = $derived(workspace !== null && workspace.id === openWorkspaceId);
	const isOwner = $derived(session?.role === 'owner');
	const members = $derived(membersQuery.data ?? []);

	const record = $derived<WorkspaceActRecord | null>(
		session && workspace
			? { workspace, context: workspaceContextOf(session, openWorkspaceId) }
			: null
	);

	// the card's acts, but who holds it, which is this page.
	const pageActions = $derived(
		record
			? toPageActions(workspaceActs, record, $LL).filter((act) => act.id !== 'workspace.members')
			: []
	);

	const access = $derived(workspace ? workspaceAccessOf(workspace, isOwner, $LL) : null);
	const held = $derived(holderCount(members, workspaceId));

	// ----- who holds it

	/** whether the add sheet is open. */
	let adding = $state(false);
	/** whether its grants are being written. */
	let writing = $state(false);
	/** what the shell refused the last save with, said in the sheet. */
	let addError = $state<string | null>(null);

	const standings = $derived(standingsQuery.data ?? []);

	/** the members this page may list or offer: never the owner, and never the reader. */
	const others = $derived(
		members.filter((each) => each.role !== 'owner' && each.id !== session?.memberId)
	);

	/**
	 * what every act on a member is gated on, read through the builder the members directory and
	 * the command menu read it through, so a card here refuses as their own card does.
	 */
	const memberContext = $derived(
		session
			? toMemberActContext(memberReaderOf(session), members, standings, memberPending())
			: null
	);

	const cards = $derived.by((): HolderCard[] => {
		if (!workspace || !memberContext) return [];

		return others.flatMap((each) => {
			const grant = each.workspaces.find((held) => held.id === workspace.id);

			if (!grant) return [];

			const standing = standings.find((one) => one.memberId === each.id) ?? null;

			return [
				{
					member: each,
					role: memberRoleName($LL, each),
					standing,
					tailored: isTailored(each.permissions, grant),
					href: holderCardOf(workspace.id, each.id),
					actions: toCardActions(
						holderActs,
						{
							holder: { member: each, context: memberContext, standing },
							workspace,
							writing
						},
						$LL
					)
				}
			];
		});
	});

	const candidates = $derived<HolderCandidate[]>(
		workspace
			? others
					.filter((each) => each.workspaces.every((held) => held.id !== workspace.id))
					.map((each) => ({
						id: each.id,
						username: each.username,
						role: memberRoleName($LL, each)
					}))
			: []
	);

	/**
	 * why the reader may put nobody in, by the one rule both ends of a grant read
	 * (`accessRefusalOf`), as the router and Rust refuse it: the act is `grantWorkspace`'s, and
	 * putting somebody in afresh is the reader's own full-access credential re-sealed, so a
	 * workspace they hold read only gives nobody.
	 */
	const addRefusal = $derived(
		accessRefusalOf(
			{
				id: workspaceId,
				name: workspace?.name ?? '',
				access: 'none',
				givable: workspace?.accessLevel === 'full-access'
			},
			'none',
			// a locked reader is told the lock, the reason that holds whatever their row carries.
			(session && lockedRefusal(session.locked, $LL)) ??
				(session && permits(session.permissions, 'grantWorkspace')
					? null
					: lacking($LL, 'grantWorkspace')),
			$LL.organization.workspaceSwitches.notHeld()
		)
	);

	/** why the plus opens nothing: the reader may put nobody in, or nobody is left to put in. */
	const plusRefusal = $derived(
		addRefusal ?? (candidates.length === 0 ? $LL.organization.workspacePage.nobodyToAdd() : null)
	);

	const openAdd = () => {
		if (plusRefusal !== null) return;

		addError = null;
		adding = true;
	};

	/**
	 * every member checked in the sheet, put in at full access in one write, in the list's order: a
	 * refusal stops it there and what went through before it stands, so the sheet stays open over
	 * the reason with the members still to put in checked, and the shared handler says it too.
	 */
	async function add(memberIds: string[]) {
		if (writing || addRefusal !== null) return;

		writing = true;
		addError = null;

		try {
			await changeAccess.mutateAsync({
				changes: memberIds.map((memberId) => ({
					workspaceId,
					memberId,
					access: 'full-access' as const
				}))
			});
			adding = false;
		} catch (error) {
			addError = toErrorText(error, $LL);
		} finally {
			writing = false;
		}
	}

	// a member named on the address is the card that was pressed: what it opens is their
	// permissions here, where the reader may edit them, and the address is cleared either way, so
	// a reload does not reopen a sheet already dismissed and the same card can be pressed again.
	$effect(() => {
		const named = recordOf(page.url);

		if (!named) return;

		// a list still on its way answers for nobody yet: the address keeps its name until it can.
		if (members.length === 0) return;

		const card = cards.find((each) => each.member.id === named);

		if (card && workspace && memberContext) {
			holderHost.run('holder.permissions', {
				holder: { member: card.member, context: memberContext, standing: card.standing },
				workspace,
				writing
			});
		}

		void goto(workspacePageOf(workspaceId), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#snippet identity()}
	<!-- the disc the rail's switcher marks it with, and the words that say what it means. -->
	{#if workspace}
		<Badge variant="secondary" data-workspace-open={workspace.id}>
			<DiscIcon class="size-3 shrink-0 text-primary" aria-hidden="true" />
			{$LL.organization.dashboard.workspaceOpenHere()}
		</Badge>
	{/if}
{/snippet}

{#snippet actions()}
	{#each pageActions as act (act.id)}
		<span class="contents" data-page-act={act.id}>
			<RecordActionControl
				label={act.label}
				icon={act.icon}
				tone={act.tone}
				shortcut={act.shortcut}
				unavailable={act.unavailable}
				onclick={act.run}
			/>
		</span>
	{/each}
{/snippet}

{#snippet fields()}
	{#if workspace && access}
		<Specification
			entries={[
				{
					label: $LL.organization.dashboard.membersTitle(),
					value:
						held === 0
							? $LL.organization.dashboard.workspaceCard.noMembers()
							: $LL.organization.dashboard.workspaceCard.memberCount({ count: held }),
					icon: UsersIcon,
					hook: 'members'
				},
				{
					label: $LL.organization.dashboard.workspaceCard.access(),
					value: access.word,
					icon: KeyRoundIcon,
					hook: 'access'
				},
				...(workspace.createdAt
					? [
							{
								label: $LL.organization.dashboard.workspaceCard.created(),
								value: formatLocaleDate($locale, workspace.createdAt, { dateStyle: 'medium' }),
								icon: CalendarPlusIcon,
								hook: 'created'
							}
						]
					: [])
			]}
		/>
	{/if}
{/snippet}

{#snippet holders()}
	{#if workspace}
		<Holders
			{cards}
			description={$LL.organization.dashboard.workspaceAccessDescription({
				workspace: workspace.name
			})}
			addRefusal={plusRefusal}
			onAdd={openAdd}
		/>

		<AddSheet
			open={adding}
			onOpenChange={(value) => {
				if (!value && !writing) adding = false;
			}}
			workspaceName={workspace.name}
			{candidates}
			isSaving={writing}
			error={addError}
			onSave={(ids) => void add(ids)}
		/>
	{/if}
{/snippet}

<RecordSurface
	isLoading={stateQuery.data === undefined && !stateQuery.isError}
	found={workspace !== null}
	backFallback={workspacesSection()}
	path={workspacePageOf(workspaceId)}
	eyebrow={$LL.common.nav.workspace()}
	title={workspace?.name ?? ''}
	identity={isOpenHere ? identity : undefined}
	{actions}
	{fields}
	collections={[
		{ value: 'members', label: $LL.organization.dashboard.membersTitle(), content: holders }
	]}
/>
