<script lang="ts" module>
	/**
	 * How tall a member's tile is, which the directory lays its grid at rather than measuring.
	 *
	 * Counted the way the other tiles are (effort 846, the cards on real data): the padding (32),
	 * the heading line at the avatar's and the control's height (32), then four facts and the
	 * foot, each a line at the facts' fixed 20 px leading with 4 px before it, and 4 px more
	 * before the first fact so the facts read as their own group. 32 + 32 + 4 + 5 × 24 = 188. It
	 * holds in Arabic only because every line sets that leading (`Cell.Fact`, `factLeading`), so a
	 * line added to the tile, or one drawn without it, changes this figure too.
	 */
	export const MEMBER_TILE_HEIGHT = 188;
</script>

<script lang="ts">
	import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import * as Cell from '$lib/design/cell';
	import { factLeading } from '$lib/design/cell/fact.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { accountInitials } from '$lib/sync';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';

	/**
	 * A member, as the members directory lays one in its grid (effort 846, ticket 32): who they
	 * are, and the facts about their account a reader scans a directory of people for.
	 *
	 * **The heading is the person**: the same two-letter disc the rail's account control draws,
	 * the username as the one strong line (_Size isn't everything_, 38), and the role in a badge
	 * beside it, which is what a badge is drawn for here ([[contexts/desktop/components]]).
	 *
	 * **Then one fact to a line, each after the glyph saying what it is** (`Cell.Fact`), so no
	 * label is written beside a value (_Labels are a last resort_, 48): whether the account has a
	 * password of its own, whether a machine is signed in on it, how many workspaces it holds, and
	 * when it joined. The password and the machine are the account's standing, a second read: until
	 * it answers, neither line is drawn, since a line guessed from nothing would say something
	 * untrue about an account somebody is working on. The standing says whether a machine is signed
	 * in and not how many, so the line says that much and no more. A count of nothing is said in
	 * words, never as a zero.
	 *
	 * **At the foot, what marks this member out**, and only where it does: permissions of their own
	 * beyond their role, and the organization offered to them. Pushed to the tile's foot, so the
	 * facts above read as one group (_Avoid ambiguous spacing_, 96).
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
		actions
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
	} = $props();

	const workspaceCount = $derived(member.workspaces.length);
	const joined = $derived(formatLocaleDate($locale, member.createdAt, { dateStyle: 'medium' }));
	const ownPermissions = $derived(member.override !== 0);
</script>

<RecordCard {href} label={member.username} {actions} layout="tile" class="gap-1">
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
		{#if standing}
			<Cell.Fact icon={KeyRoundIcon} class="mt-1">
				<span class="truncate" data-member-password={standing.passwordSet ? 'set' : 'unset'}>
					{standing.passwordSet
						? $LL.organization.dashboard.memberCard.passwordSet()
						: $LL.organization.dashboard.memberCard.noPassword()}
				</span>
			</Cell.Fact>
			<Cell.Fact icon={LaptopIcon}>
				<span
					class="truncate"
					data-member-machine={standing.machineSignedIn ? 'signed-in' : 'none'}
				>
					{standing.machineSignedIn
						? $LL.organization.dashboard.memberCard.signedIn()
						: $LL.organization.dashboard.memberCard.noMachine()}
				</span>
			</Cell.Fact>
		{/if}

		<Cell.Fact icon={BuildingIcon} class={standing ? undefined : 'mt-1'}>
			<span class="truncate" data-member-workspaces={workspaceCount}>
				{workspaceCount === 0
					? $LL.organization.dashboard.memberCard.noWorkspaces()
					: $LL.organization.dashboard.memberCard.workspaces({ count: workspaceCount })}
			</span>
		</Cell.Fact>

		<Cell.Fact icon={CalendarIcon}>
			<span class="truncate" data-member-joined>
				{$LL.organization.dashboard.memberCard.joined({ date: joined })}
			</span>
		</Cell.Fact>

		{#if ownPermissions || member.offeredOwnership}
			<span
				data-member-marks
				class="pointer-events-none relative mt-auto flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap {factLeading}"
			>
				{#if ownPermissions}
					<Cell.Fact icon={UserCogIcon} class="shrink-0">
						<span data-member-own-permissions>
							{$LL.organization.dashboard.memberCard.ownPermissions()}
						</span>
					</Cell.Fact>
				{/if}

				{#if member.offeredOwnership}
					<Cell.Fact icon={CrownIcon} class="min-w-0">
						<span class="truncate" data-member-offered>
							{$LL.organization.dashboard.memberCard.offered()}
						</span>
					</Cell.Fact>
				{/if}
			</span>
		{/if}
	{/snippet}
</RecordCard>
