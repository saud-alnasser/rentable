<script lang="ts">
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { toPageActions } from '$lib/act';
	import DiscIcon from '$lib/design/cell/disc.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { isTailored, type AccessChoice } from '$lib/organization/access/access';
	import { useChangeAccess } from '$lib/organization/access/query';
	import { workspaceActs } from '$lib/organization/host.svelte';
	import { useFetchMembers } from '$lib/organization/member/query';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { lacking } from '$lib/organization/role/acts';
	import { memberRoleName } from '$lib/organization/role/role';
	import { workspaceContextOf, type WorkspaceActRecord } from '$lib/organization/workspace/acts';
	import { workspacePageOf, workspacesSection } from '$lib/organization/workspace/address';
	import { holderCount, workspaceAccessOf } from '$lib/organization/workspace/standing';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { permits } from '@rentable/workspace-permission';
	import Holders, { type HolderRow } from './holders.svelte';

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
	 * the organization host's, mounted in the frame, so the page mounts no form and no dialog.
	 *
	 * **Below, the people who could hold it** (`./holders.svelte`), each in or out, written at once
	 * through the one access write the member's card makes (`useChangeAccess`), one change per
	 * switch (effort 846, requirement 4: every control in the area applies at once). A switch the
	 * shell refuses is put back, and the shared handler says why. *Who held a workspace was a
	 * dialog of switches under one save until this ticket, which the human found looked bad.*
	 *
	 * **Who is listed is decided here**: never the owner, whose grant is never withdrawn, and never
	 * the reader, who does not write their own row. Rust refuses both again, and every grant and
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

	/** the level chosen per member while its write runs, so the switch shows what was asked. */
	let chosen = $state<Record<string, AccessChoice>>({});
	/** the member whose write is running. */
	let writing = $state<string | null>(null);

	const rows = $derived.by((): HolderRow[] => {
		if (!workspace) return [];

		const givable = workspace.accessLevel === 'full-access';

		return members
			.filter((candidate) => candidate.role !== 'owner' && candidate.id !== session?.memberId)
			.map((candidate) => {
				const grant = candidate.workspaces.find((each) => each.id === workspace.id);

				return {
					id: candidate.id,
					name: candidate.username,
					role: memberRoleName($LL, candidate),
					access: (grant?.access ?? 'none') as AccessChoice,
					tailored: grant ? isTailored(candidate.permissions, grant) : false,
					givable
				};
			});
	});

	// the workspace card's members act is refused without `grantWorkspace`; here every switch is,
	// naming it, as the member's card refuses its workspaces.
	const refusal = $derived(
		session && permits(session.permissions, 'grantWorkspace')
			? null
			: lacking($LL, 'grantWorkspace')
	);

	// a choice the members now say is held is no longer a choice: the list read again after a
	// write is what the switch shows from then on, whoever writes next.
	$effect(() => {
		for (const row of rows) {
			if (chosen[row.id] === row.access) delete chosen[row.id];
		}
	});

	/**
	 * one switch turned, written at once: off withdraws the grant there and then, and on grants it
	 * again, so off and on is two writes, refused as a fresh grant is. The switch shows what was asked while the write runs and once it has gone through, until the
	 * members read again say the same; where the shell refuses it, it goes back to what is held,
	 * and the shared handler says why.
	 */
	async function pick(memberId: string, value: AccessChoice) {
		const row = rows.find((each) => each.id === memberId);

		if (!row || writing !== null || value === (chosen[memberId] ?? row.access)) return;

		chosen[memberId] = value;
		writing = memberId;

		try {
			await changeAccess.mutateAsync({
				changes: [{ workspaceId, memberId, access: value }]
			});
		} catch {
			// said by the shared handler; the switch goes back to what is held.
			delete chosen[memberId];
		} finally {
			writing = null;
		}
	}
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
		<div class="flex flex-col gap-3" data-workspace-holders>
			<Field.Description>
				{$LL.organization.dashboard.workspaceAccessDescription({ workspace: workspace.name })}
			</Field.Description>
			<Holders
				{rows}
				access={chosen}
				onPick={(id, value) => void pick(id, value)}
				{refusal}
				{writing}
			/>
		</div>
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
