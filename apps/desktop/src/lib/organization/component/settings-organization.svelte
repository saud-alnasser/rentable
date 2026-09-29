<script lang="ts" module>
	import {
		useFetchMemberStandings as startStandings,
		useFetchMembers as startMembers
	} from '$lib/organization/member/query';
	import { useFetchOrganizationState as startState } from '$lib/organization/query';
	import { useFetchRoles as startRoles } from '$lib/organization/role/query';
	import { useFetchRemoteSyncState as startSync } from '$lib/sync/ui';

	/**
	 * What the organization's settings sections read, started as the area opens (its `load`):
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
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationDeleteOrganization from '$lib/organization/component/delete-organization.svelte';
	import OrganizationDisconnect from '$lib/organization/component/disconnect.svelte';
	import OrganizationForgetAccount from '$lib/organization/setup/component/forget-account.svelte';
	import OrganizationMark from '$lib/organization/component/mark.svelte';
	import OrganizationMembers from '$lib/organization/member/component/directory.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/setup/component/reconnect-authority.svelte';
	import OrganizationRoles from '$lib/organization/role/component/directory.svelte';
	import OrganizationStanding from '$lib/organization/component/standing.svelte';
	import { memberReaderOf } from '$lib/organization/member/acts';
	import { roleReaderOf } from '$lib/organization/role/acts';
	import {
		useDeleteOrganization,
		useDisconnectOrganization,
		useFetchOrganizationState
	} from '$lib/organization/query';
	import { useFetchMemberStandings, useFetchMembers } from '$lib/organization/member/query';
	import { useFetchRoles } from '$lib/organization/role/query';
	import { administersMembers } from '$lib/organization/member/member';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';
	import { permits } from '@rentable/workspace-permission';

	/**
	 * The settings area's organization section: where this machine stands with the organization
	 * on Turso, the mark its pages print, the Turso account, the roles and the people, and the two
	 * acts that end something. The organization contributes it (`surface.ts`), and the area draws
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
	 * foot.** *Settled by the human on the real organization.* It opens with how this machine
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

	const deleteOrganizationMutation = useDeleteOrganization();
	const disconnectOrganization = useDisconnectOrganization();

	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && !holdsTursoAuthority);
	// the directory is this section's own gate: it was a section of its own, and what admitted a
	// reader to that section now decides whether the block is drawn.
	const administers = $derived(administersMembers(session));

	/**
	 * the disconnect, once confirmed: the shell forgets the organization, and the area leaves for
	 * the wall. A refusal is said by the shared handler and rethrown so the confirm stays open on
	 * it.
	 */
	const disconnect = async () => {
		await disconnectOrganization.mutateAsync();
		await leaveForTheWall();
	};

	let deletingOrganization = $state(false);
	/** what the shell refused the last delete with, marked on the surface's password field. */
	let deleteRefusal = $state<string | null>(null);

	/**
	 * the organization, deleted with the owner's password: every workspace database and the
	 * organization's own go from the Turso account, this machine forgets what it held, and the
	 * area leaves for the wall, exactly as a disconnect leaves it.
	 *
	 * The same shape the password change has, and for the same reason: a delete that went through
	 * closes the surface, which empties the one value on it, and a refusal keeps it open with what
	 * was typed and puts the sentence on the password, because the password is what the shell
	 * refuses this with ([[rules/interface]], *Validation errors*). Nothing is drawn afterwards
	 * either way, since the machine that deleted the organization is a machine holding nothing.
	 */
	const deleteOrganization = async (password: string) => {
		deleteRefusal = null;

		try {
			await deleteOrganizationMutation.mutateAsync({ password });
			await leaveForTheWall();
			deletingOrganization = false;
		} catch (error) {
			deleteRefusal = toErrorText(error, $LL);
		}
	};
</script>

{#if session}
	<Field.Group>
		<!-- how this machine stands to the organization first: it is what the section is about,
		     it is what a reader who came here worried is looking for, and it reads the same for
		     everybody. Then the signature or seal its pages print, then the account the databases
		     sit on, then the people, then the two acts that end something. *The directory stood
		     first until the human read the four sections and asked for the elements in each to be
		     ordered.* -->
		{#if syncQuery.data}
			<Field.Set data-standing-block>
				<OrganizationStanding syncState={syncQuery.data} {session} {needsAuthority} />
			</Field.Set>

			<Separator />
		{/if}

		<!-- what the organization prints on its pages: everybody sees it, and whoever holds the
		     flag to manage it changes it (effort 835, requirement 13; effort 838). -->
		<OrganizationMark setsMark={permits(session.permissions, 'manageMark')} />

		<Separator />

		<!-- the Turso account, which is the owner's alone: reconnected where this machine holds
		     no authority, and given back where it does. Both are the same subject, so they share
		     the legend rather than standing as two sections a reader meets one of. -->
		{#if isOwner}
			<Field.Set>
				<Field.Legend>{$LL.organization.dashboard.authorityTitle()}</Field.Legend>
				{#if needsAuthority}
					<OrganizationReconnectAuthority onReconnected={() => void stateQuery.refetch()} />
				{:else}
					<OrganizationForgetAccount />
				{/if}
			</Field.Set>

			<Separator />
		{/if}

		<!-- the roles, before the people who hold them: what each kind of person may do, read by
		     everybody and changed by whoever holds the flag to (effort 838, requirement 12). The
		     section answers the search key once, and where the people are drawn below, it is
		     theirs, the set a reader searches ([[rules/interface]], *Search*). -->
		<OrganizationRoles
			roles={rolesQuery.data ?? []}
			{members}
			reader={roleReaderOf(session)}
			answersSearchKey={!administers}
		/>

		<Separator />

		<!-- the people. The directory owns its own legend, the sentence under it, the cards and
		     the add at its foot; what is decided here is what this reader may do, and a member
		     who changes nobody's row meets no directory at all. -->
		{#if administers}
			<!-- the reader's gates, read by the one builder the command menu reads them by. -->
			<OrganizationMembers
				{members}
				standings={standingsQuery.data ?? []}
				{...memberReaderOf(session)}
			/>

			<Separator />
		{/if}

		<!-- and the foot, where both acts end something: leaving with this machine, and leaving
		     with the organization. One legend over the two, because what they have in common is
		     the thing a reader needs to know before reading either, and the heavier one is last.
		     The delete is the owner's and needs the authority the block above is about, so an
		     owner whose machine holds none meets the disconnect alone, exactly as they did while
		     the delete sat inside that block. -->
		<Field.Set data-leaving>
			<Field.Legend>{$LL.organization.dashboard.leavingTitle()}</Field.Legend>
			<OrganizationDisconnect
				organizationName={session.organizationName}
				onDisconnect={disconnect}
			/>

			{#if isOwner && !needsAuthority}
				<Field.Separator />

				<OrganizationDeleteOrganization
					open={deletingOrganization}
					onOpenChange={(value) => {
						deletingOrganization = value;

						if (!value) deleteRefusal = null;
					}}
					isDeleting={deleteOrganizationMutation.isPending}
					errorMessage={deleteRefusal}
					onDelete={(password) => void deleteOrganization(password)}
				/>
			{/if}
		</Field.Set>
	</Field.Group>
{/if}
