<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Item from '@rentable/design/primitive/item/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { toPageActions, type PageAction } from '$lib/act';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationDeleteOrganization from '$lib/organization/component/delete-organization.svelte';
	import OrganizationDisconnect from '$lib/organization/component/disconnect.svelte';
	import type {
		MemberStanding,
		OrganizationMember,
		OrganizationSession
	} from '$lib/organization/host';
	import { memberActs, memberHost, memberPending } from '$lib/organization/host.svelte';
	import {
		memberReaderOf,
		toMemberActContext,
		type MemberActId,
		type MemberActRecord
	} from '$lib/organization/member/acts';
	import { useDeleteOrganization, useDisconnectOrganization } from '$lib/organization/query';
	import DoorOpenIcon from '@lucide/svelte/icons/door-open';

	/**
	 * The organization section's last card, across both columns: the ways a reader steps away from
	 * the organization, told apart by who is reading (effort 846, requirement 14, and *Everything
	 * in a tab is a card*).
	 *
	 * **A member meets one act, *disconnect this machine***, and the line under it says the
	 * organization stays on Turso and a new link brings them back. Being removed is done by
	 * somebody above them, so nothing else here is theirs.
	 *
	 * **An owner meets three, in the order they would reach for them.** Handing over ownership
	 * first, since that is how an owner steps away and keeps the organization; then disconnecting
	 * this machine; then deleting the organization, last and set apart, as the one act nothing
	 * undoes. The delete needs the Turso authority, so an owner whose machine holds none meets the
	 * first two. Each act says what it ends in the line under its name, and no two look alike: the
	 * handover is an ordinary row, and the two that end something are the group's error rows.
	 *
	 * **The handover is the act the owner's own member card carries, projected from the same
	 * declaration** (`member/acts.ts`): the reader's own member record through `toPageActions`,
	 * kept to the offer and its withdrawal, and run through the member host, so its label, glyph
	 * and refusal cannot differ from the card's. Where nobody can take the organization yet, it is
	 * drawn refused with that reason, at the control, on hover and focus ([[rules/interface]],
	 * *An act that cannot run says why at the control*). It is drawn once the reader's own row has
	 * been answered, since an act needs the record it acts on.
	 *
	 * *The disconnect and the delete stood under one legend as two paragraphs and two outline
	 * buttons until effort 846, only the delete's label red; the handover lived on the owner's card
	 * alone.*
	 */
	let {
		session,
		members,
		standings,
		holdsTursoAuthority,
		leaveForTheWall
	}: {
		/** who is reading. */
		session: OrganizationSession;
		/** everybody in the organization, the reader's own row among them once answered. */
		members: OrganizationMember[];
		/** where each account stands, which says who could be offered the organization. */
		standings: MemberStanding[];
		/** whether this machine holds the Turso authority the delete needs. */
		holdsTursoAuthority: boolean;
		/** leave the area for the wall, once this machine lets go of the organization. */
		leaveForTheWall: () => Promise<void>;
	} = $props();

	const isOwner = $derived(session.role === 'owner');

	/** the reader's own card as the member acts read it, once their row has been answered. */
	const ownRecord = $derived.by((): MemberActRecord | null => {
		const own = members.find((member) => member.id === session.memberId);

		if (!own) return null;

		return {
			member: own,
			context: toMemberActContext(memberReaderOf(session), members, standings, memberPending()),
			standing: standings.find((standing) => standing.memberId === own.id) ?? null
		};
	});

	const HANDOVER: readonly MemberActId[] = ['member.offerOwnership', 'member.withdrawOffer'];

	/** the handover as the owner's card offers it: the offer, or the withdrawal of one standing. */
	const handover = $derived(
		ownRecord
			? (toPageActions(memberActs, ownRecord, $LL).find((act) =>
					HANDOVER.includes(act.id as MemberActId)
				) ?? null)
			: null
	);

	const deleteOrganizationMutation = useDeleteOrganization();
	const disconnectOrganization = useDisconnectOrganization();

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
	 * A delete that went through closes the surface, which empties the one value on it, and a
	 * refusal keeps it open with what was typed and puts the sentence on the password, because the
	 * password is what the shell refuses this with ([[rules/interface]], *Validation errors*).
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

	const reasonId = $props.id();
</script>

{#snippet handoverRow(act: PageAction, record: MemberActRecord)}
	{@const offering = act.id === 'member.offerOwnership'}
	{@const Icon = act.icon}
	{#snippet consequence()}
		<span data-leaving-consequence>
			{offering
				? $LL.organization.dashboard.handOverGoes()
				: $LL.organization.dashboard.offerStandsGoes()}
		</span>
	{/snippet}

	<SettingsRow icon={act.icon} name={act.label} meta={consequence}>
		{#snippet control({ labelId })}
			<Tooltip.Root disabled={!act.unavailable}>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<!-- refused where the declaration says so, and never the platform's disabled: the
						     control keeps the keyboard and the pointer, and its reason is its description. -->
						<Button
							{...props}
							type="button"
							variant="outline"
							size="sm"
							class={act.unavailable ? unavailableControl : undefined}
							aria-labelledby={labelId}
							aria-disabled={act.unavailable ? 'true' : undefined}
							aria-describedby={act.unavailable ? reasonId : undefined}
							data-act={act.id}
							data-unavailable={act.unavailable ? '' : undefined}
							onclick={() => {
								if (!act.unavailable) {
									memberHost.run(act.id as MemberActId, record);
								}
							}}
						>
							<Icon class="size-4" />
							{offering
								? $LL.organization.dashboard.handOver()
								: $LL.organization.dashboard.withdraw()}
							{#if act.unavailable}
								<span id={reasonId} class="sr-only">{act.unavailable}</span>
							{/if}
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>
					<span data-unavailable-reason>{act.unavailable}</span>
				</Tooltip.Content>
			</Tooltip.Root>
		{/snippet}
	</SettingsRow>
{/snippet}

{#snippet ending()}
	<OrganizationDisconnect
		organizationName={session.organizationName}
		{isOwner}
		onDisconnect={disconnect}
	/>

	{#if isOwner && holdsTursoAuthority}
		<!-- set apart from the disconnect: the one act here that nothing undoes. Decorative, so the
		     list holds rows and nothing else for a screen reader to count. -->
		<Item.Separator decorative class="my-0" />

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
{/snippet}

{#snippet handoverRows()}
	{#if handover && ownRecord}
		{@render handoverRow(handover, ownRecord)}
	{/if}
{/snippet}

<!-- the last card of the section, across both columns. A member, or an owner whose row is not
     answered yet, meets the acts that end something alone, as the card's end after its header. -->
<div data-leaving class="contents">
	<SettingsGroup
		icon={DoorOpenIcon}
		title={$LL.organization.dashboard.leavingTitle()}
		description={$LL.organization.dashboard.leavingDescription()}
		rows={isOwner && handover && ownRecord ? handoverRows : undefined}
		end={ending}
		span="full"
	/>
</div>
