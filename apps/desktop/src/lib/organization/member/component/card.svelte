<script lang="ts" module>
	/**
	 * How tall a member's tile is, which the directory lays its grid at rather than measuring.
	 *
	 * Counted the way the other tiles are (effort 846, ticket 37): the padding (32), the heading
	 * line at the avatar's and the control's height (32), then 12 px to the fields, two rows of
	 * fields 8 px apart, each field 8 px of padding above and below a name and a value at a fixed
	 * 20 px leading (8 + 20 + 20 + 8 = 56), then 12 px to the foot, whose badges stand at 20 px.
	 * 32 + 32 + 12 + (56 + 8 + 56) + 12 + 20 = 228. The foot is counted whether or not it draws,
	 * so every tile in the directory stands at one height. It holds in Arabic only because every
	 * line sets its own leading, so a line added to the tile, or one drawn without it, changes
	 * this figure too.
	 */
	export const MEMBER_TILE_HEIGHT = 228;
</script>

<script lang="ts">
	import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import * as Cell from '$lib/design/cell/index.ts';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { accountInitials } from '$lib/sync';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';

	/**
	 * A member, as the members directory lays one in its grid (effort 846, tickets 32 and 37): who
	 * they are, and the facts about their account a reader scans a directory of people for.
	 *
	 * **The heading is the person**: the same two-letter disc the rail's account control draws,
	 * the username as the one strong line (_Size isn't everything_, 38), and the role in a badge
	 * beside it, which is what a badge is drawn for here ([[contexts/desktop/components]]).
	 *
	 * **Then four fields, two by two**, at the human's word of 2026-10-02: each a softly tinted
	 * tile holding its glyph and its name, small and muted, over the value in the stronger weight.
	 * Four short values side by side are the dashboard case, where a name is wanted to tell them
	 * apart and is drawn as supporting content (_Labels are a last resort_, its *Labels are
	 * secondary*, 51). The tint is the muted token on the card's own surface, which sets each
	 * field apart with no border (_Use fewer borders_, its *Use two different background colors*,
	 * 240), and it resolves through the tokens in the dark as in the light. No field takes a tone:
	 * none of the values is an event to report ([[rules/interface]], *Tone*), and a member with no
	 * password yet is a member who has not opened their link, not a fault. A value saying nothing
	 * is there (*not yet*, *none*) is drawn muted rather than in the value's colour, so the fields
	 * holding something lead (_Emphasize by de-emphasizing_, 46).
	 *
	 * **The workspaces and the joining fill the first row, the standing the second.** The
	 * password and the machine are the account's standing, a second read, and until it answers
	 * neither field is drawn, since a value guessed from nothing would say something untrue about
	 * an account somebody is working on. Laid second, they arrive under fields already standing
	 * and move nothing. The standing says whether a machine is signed in and not how many, so the
	 * field says that much and no more. A count of nothing is said in words, never as a zero.
	 *
	 * **At the foot, what marks this member out**, and only where it does: permissions of their
	 * own beyond their role, and the organization offered to them, each a small outline badge with
	 * its glyph, quieter than the role's filled one. Pushed to the tile's foot, so the fields above
	 * read as one group (_Avoid ambiguous spacing_, 96). On a workspace's page the foot also says
	 * *custom here* where what they may do in that workspace is tailored (`tailoredHere`, effort
	 * 846, ticket 50), with the glyph its *tailor access here* act carries.
	 *
	 * The joining is a moment rather than a domain day, so it is said in the reader's own time
	 * zone, as the machines a reader holds are, and not through `Cell.Date`, which reads whole UTC
	 * days.
	 */
	let {
		member,
		standing,
		role,
		href,
		actions,
		tailoredHere = false
	}: {
		member: OrganizationMember;
		/** where the account stands, or `null` until the standings have been answered. */
		standing: MemberStanding | null;
		/** the role's name, in the reader's words. */
		role: string;
		/** where the tile opens, already resolved. */
		href: string;
		/** what the member offers, on the tile's control and its context gesture. */
		actions: RecordCardAction[];
		/** whether what they may do in the workspace the tile stands for is tailored there. */
		tailoredHere?: boolean;
	} = $props();

	const workspaceCount = $derived(member.workspaces.length);
	const joined = $derived(formatLocaleDate($locale, member.createdAt, { dateStyle: 'medium' }));
	const ownPermissions = $derived(member.override !== 0);
</script>

<!-- one field: the glyph and the name on its first line, the value under them. Both lines set a
     20 px leading of their own, so a field is one height in both locales. -->
<RecordCard {href} label={member.username} {actions} layout="tile" class="gap-3">
	{#snippet heading()}
		<!-- the same disc the rail's account control and the identity card draw, with the same two
		     letters (requirement 24 of effort 824), at the heading line's height. -->
		<Avatar.Root class="size-8 shrink-0 rounded-full">
			<Avatar.Fallback class="rounded-full text-xs">
				{accountInitials(member.username)}
			</Avatar.Fallback>
		</Avatar.Root>
		<span class="truncate text-sm font-semibold" data-member-username>
			<bdi>{member.username}</bdi>
		</span>
		<Badge variant="secondary" class="max-w-full shrink" data-member-role>
			<bdi class="truncate">{role}</bdi>
		</Badge>
	{/snippet}

	{#snippet content()}
		<div data-member-fields class="pointer-events-none relative grid grid-cols-2 gap-2">
			<Cell.Field
				hook="member-field"
				icon={BuildingIcon}
				name={$LL.settings.section.workspaces()}
				value={workspaceCount === 0
					? $LL.organization.dashboard.memberCard.noWorkspaces()
					: $LL.organization.dashboard.memberCard.workspaceCount({ count: workspaceCount })}
				empty={workspaceCount === 0}
				valueAttributes={{ 'data-member-workspaces': workspaceCount }}
			/>

			<Cell.Field
				hook="member-field"
				icon={CalendarIcon}
				name={$LL.organization.dashboard.memberCard.joined()}
				value={joined}
				valueAttributes={{ 'data-member-joined': '' }}
			/>

			{#if standing}
				<Cell.Field
					hook="member-field"
					icon={KeyRoundIcon}
					name={$LL.organization.dashboard.memberCard.password()}
					value={standing.passwordSet
						? $LL.organization.dashboard.memberCard.passwordSet()
						: $LL.organization.dashboard.memberCard.noPassword()}
					empty={!standing.passwordSet}
					valueAttributes={{ 'data-member-password': standing.passwordSet ? 'set' : 'unset' }}
				/>

				<Cell.Field
					hook="member-field"
					icon={LaptopIcon}
					name={$LL.organization.dashboard.memberCard.machine()}
					value={standing.machineSignedIn
						? $LL.organization.dashboard.memberCard.signedIn()
						: $LL.organization.dashboard.memberCard.noMachine()}
					empty={!standing.machineSignedIn}
					valueAttributes={{
						'data-member-machine': standing.machineSignedIn ? 'signed-in' : 'none'
					}}
				/>
			{/if}
		</div>

		{#if ownPermissions || member.offeredOwnership || tailoredHere}
			<div
				data-member-marks
				class="pointer-events-none relative mt-auto flex h-5 min-w-0 items-center gap-1.5 overflow-hidden"
			>
				{#if tailoredHere}
					<Badge
						variant="outline"
						class="h-5 leading-4 text-muted-foreground"
						data-member-custom-here
					>
						<SlidersHorizontalIcon aria-hidden="true" />
						{$LL.organization.workspaceSwitches.customHere()}
					</Badge>
				{/if}

				{#if ownPermissions}
					<Badge
						variant="outline"
						class="h-5 leading-4 text-muted-foreground"
						data-member-own-permissions
					>
						<UserCogIcon aria-hidden="true" />
						{$LL.organization.dashboard.memberCard.ownPermissions()}
					</Badge>
				{/if}

				{#if member.offeredOwnership}
					<Badge
						variant="outline"
						class="h-5 min-w-0 shrink leading-4 text-muted-foreground"
						data-member-offered
					>
						<CrownIcon aria-hidden="true" />
						<span class="truncate">{$LL.organization.dashboard.memberCard.offered()}</span>
					</Badge>
				{/if}
			</div>
		{/if}
	{/snippet}
</RecordCard>
