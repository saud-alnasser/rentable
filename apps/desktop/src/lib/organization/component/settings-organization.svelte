<script lang="ts" module>
	import {
		useFetchMemberStandings as startStandings,
		useFetchMembers as startMembers
	} from '$lib/organization/member/query';
	import { useFetchOrganizationState as startState } from '$lib/organization/query';
	import { useFetchRoles as startRoles } from '$lib/organization/role/query';
	import { useFetchRemoteSyncState as startSync } from '$lib/sync/ui';

	/**
	 * What the organization's settings sections read, started as the settings page mounts (its `load`):
	 * the session, the sync record, the members, where each stands and the roles. The settings
	 * route asked for all five as it loaded until effort 840, so a reader switching to one of these
	 * sections met data rather than a load, and this keeps that moment. The sections read the same
	 * queries again and get this cache.
	 */
	export function loadOrganizationSettings() {
		const stateQuery = startState();
		startSync(() => (stateQuery.data?.session ?? null) !== null);
		startMembers();
		startStandings();
		startRoles();
	}
</script>

<script lang="ts">
	import type { SettingsSectionProps } from '$lib/feature/surface';
	import SettingsGrid from '@rentable/design/block/settings-grid.svelte';
	import OrganizationLeaving from '$lib/organization/component/leaving.svelte';
	import OrganizationMark from '$lib/organization/component/mark.svelte';
	import OrganizationMembers from '$lib/organization/member/component/directory.svelte';
	import OrganizationRoles from '$lib/organization/role/component/directory.svelte';
	import OrganizationStanding from '$lib/organization/component/standing.svelte';
	import { memberReaderOf } from '$lib/organization/member/acts';
	import { roleReaderOf } from '$lib/organization/role/acts';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { useFetchMemberStandings, useFetchMembers } from '$lib/organization/member/query';
	import { useFetchRoles } from '$lib/organization/role/query';
	import { administersMembers } from '$lib/organization/member/member';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
	import { permits } from '@rentable/workspace-permission';

	/**
	 * The settings area's organization section: where this machine stands with the organization
	 * on Turso, the mark its pages print, the roles and the people, and the ways a reader steps
	 * away (`leaving.svelte`), which holds an owner's Turso account. The organization contributes it (`surface.ts`), and the area draws
	 * it while somebody is signed in.
	 *
	 * **What it reads and writes is its own**, the way a record's section reads its records. A
	 * member's or a role's acts are not among them: the directories project them from
	 * `member/acts.ts` and `role/acts.ts`, and the organization host in the frame runs them (effort
	 * 832, requirement 8). What it cannot do is leave the page once this machine lets go of the
	 * organization, so the area hands it `leaveForTheWall`. *The settings route read all of this
	 * and handed the area a callback per act until effort 840, when the area stopped naming the
	 * organization.*
	 *
	 * **Inside the section: what it is about, then what it holds, then what ends something, at the
	 * foot**, each a card in the section's grid (effort 846, *Everything in a tab is a card*). *Settled by the human on the real organization.* It opens with how this machine
	 * stands to the organization and closes with leaving it. What each block is gated on did not
	 * change with the order, and Rust refuses every one of them again.
	 */
	let { leaveForTheWall }: SettingsSectionProps = $props();

	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);
	/** whether this machine holds the Turso authority: the owner's, after a consent. */
	const holdsTursoAuthority = $derived(stateQuery.data?.holdsTursoAuthority === true);

	const syncQuery = useFetchRemoteSyncState(() => session !== null);
	const membersQuery = useFetchMembers();
	// where each account stands, asked beside the list and joined to it on the member's id: the
	// password is on the signed member row and the machine is on the register (effort 828,
	// requirement 19).
	const standingsQuery = useFetchMemberStandings();
	// every role, which this section lists (effort 838, requirement 12).
	const rolesQuery = useFetchRoles();

	const members = $derived(membersQuery.data ?? []);

	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && !holdsTursoAuthority);
	// the directory is this section's own gate: it was a section of its own, and what admitted a
	// reader to that section now decides whether the block is drawn.
	const administers = $derived(administersMembers(session));
</script>

{#if session}
	<!-- each block is a card, one under the next in the section's column (effort 846, *Everything
	     in a tab is a card*, and requirement 1 as revised on 2026-10-02): how this machine stands
	     to the organization first, since it is what the section is about and what a reader who
	     came here worried is looking for; then the signature or seal; then the roles and the
	     people, two directories never boxed, since their records are cards already; then the
	     ways a reader steps away, last, which for an owner holds the Turso account. *The
	     directory stood first until the human read the four sections and asked for the elements in
	     each to be ordered; the cards stood two to a row for a day until the human asked for each
	     under the next; the Turso account was a card of its own until ticket 38 folded it into
	     leaving.* -->
	<SettingsGrid>
		{#if syncQuery.data}
			<div data-standing-block class="contents">
				<OrganizationStanding syncState={syncQuery.data} {session} {needsAuthority} />
			</div>
		{/if}

		<!-- what the organization prints on its pages: everybody sees it, and whoever holds the
		     flag to manage it changes it (effort 835, requirement 13; effort 838). -->
		<OrganizationMark setsMark={permits(session.permissions, 'manageMark')} />

		<!-- the roles, before the people who hold them: what each kind of person may do, read by
		     everybody and changed by whoever holds the flag to (effort 838, requirement 12). The
		     section answers the search key once, and where the people are drawn below, it is
		     theirs, the set a reader searches ([[rules/interface]], *Search*). -->
		<div data-settings-directory>
			<OrganizationRoles
				roles={rolesQuery.data ?? []}
				{members}
				reader={roleReaderOf(session)}
				answersSearchKey={!administers}
			/>
		</div>

		<!-- the people. The directory owns its own heading, the sentence under it, the cards and
		     the add in its tray; what is decided here is what this reader may do, and a member
		     who changes nobody's row meets no directory at all. -->
		{#if administers}
			<div data-settings-directory>
				<!-- the reader's gates, read by the one builder the command menu reads them by. -->
				<OrganizationMembers
					{members}
					standings={standingsQuery.data ?? []}
					{...memberReaderOf(session)}
				/>
			</div>
		{/if}

		<!-- and the foot: the ways a reader steps away, told apart by who is reading (effort 846,
		     requirement 14). A member meets the disconnect alone; an owner meets the Turso account's
		     row first, reconnected where this machine holds no authority (requirement 13, folded in
		     by ticket 38), then the transfer, the forget, the disconnect, and the delete, last and
		     set apart. -->
		<OrganizationLeaving
			{session}
			{members}
			standings={standingsQuery.data ?? []}
			{holdsTursoAuthority}
			onReconnected={() => void stateQuery.refetch()}
			{leaveForTheWall}
		/>
	</SettingsGrid>
{/if}
