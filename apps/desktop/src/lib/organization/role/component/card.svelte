<script lang="ts" module>
	/**
	 * How tall a role's tile is, which the directory lays its grid at rather than measuring.
	 *
	 * Counted the way the member's tile is (effort 846, tickets 37 and 39): the padding (32), the
	 * heading line at the glyph tile's and the control's height (32), then 12 px to the fields, two
	 * rows of fields 8 px apart, each field 8 px of padding above and below a name and a value at a
	 * fixed 20 px leading (8 + 20 + 20 + 8 = 56). 32 + 32 + 12 + (56 + 8 + 56) = 196. A role has
	 * no foot, so nothing more is counted. It holds in Arabic only because every line sets its own
	 * leading, so a line added to the tile, or one drawn without it, changes this figure too.
	 */
	export const ROLE_TILE_HEIGHT = 196;
</script>

<script lang="ts">
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { OrganizationRole } from '$lib/organization/host';
	import { roleReach, type Reach } from '$lib/organization/role/role';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UsersIcon from '@lucide/svelte/icons/users';

	type IconComponent = typeof ShieldIcon;

	/**
	 * A role, as the roles directory lays one in its grid, in rank order (effort 846, ticket 39, the
	 * human's walk of 2026-10-02: "they should match the cards that use icons ad badges like the
	 * members card").
	 *
	 * **The heading is the role**: a glyph tile holding the shield the roles block is named by,
	 * where a member's tile holds the person's disc, the role's name as the one strong line, and
	 * in a badge beside it how many hold it. Nobody holding it is said in words, never as a zero.
	 *
	 * **Then four fields, two by two**, drawn as the member's are: each a softly tinted tile with
	 * its glyph and its name, small and muted, over the value in the stronger weight. What the role
	 * may read and what it may change come first, as the kinds of record it reaches out of every
	 * kind there is; the people acts and the organization acts it holds come second, out of each
	 * set's own number. A field reaching everything says so in words (*every record*, *every
	 * act*), and one reaching nothing says that in words and is drawn muted, so the fields holding
	 * something lead (_Emphasize by de-emphasizing_, 46). Which kinds, and which acts, are the
	 * editor's to say, which the card opens.
	 */
	let {
		role,
		name,
		href,
		actions
	}: {
		role: OrganizationRole;
		/** the role's name, in the reader's words. */
		name: string;
		/** where the tile opens, already resolved. */
		href: string;
		/** what the role offers, on the tile's control and its context gesture. */
		actions: RecordCardAction[];
	} = $props();

	const reach = $derived(roleReach(role.mask));

	const kindsValue = (each: Reach) =>
		each.held === 0
			? $LL.organization.roleCard.noKinds()
			: each.held === each.total
				? $LL.organization.roleCard.everyRecord()
				: $LL.organization.roleCard.kindsOf(each);

	const actsValue = (each: Reach) =>
		each.held === 0
			? $LL.organization.roleCard.noActs()
			: each.held === each.total
				? $LL.organization.roleCard.everyAct()
				: $LL.organization.roleCard.actsOf(each);
</script>

<!-- one field: the glyph and the name on its first line, the value under them, as the member's
     tile draws its own. Both lines set a 20 px leading of their own, so a field is one height in
     both locales. -->
{#snippet field(Icon: IconComponent, kind: string, label: string, value: string, held: boolean)}
	<div data-role-field={kind} class="flex min-w-0 flex-col rounded-lg bg-muted px-3 py-2">
		<span
			data-role-field-name
			class="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground"
		>
			<Icon class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
			<span class="truncate">{label}</span>
		</span>
		<span
			data-role-field-value
			data-held={held ? 'some' : 'none'}
			class={[
				'truncate text-sm leading-5 font-medium',
				held ? 'text-foreground' : 'text-muted-foreground'
			]}
		>
			{value}
		</span>
	</div>
{/snippet}

<RecordCard {href} label={name} {actions} layout="tile" class="gap-3">
	{#snippet heading()}
		<!-- the glyph tile, at the heading line's height, where a member's tile holds the person's
		     disc. -->
		<span
			data-role-glyph
			class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
		>
			<ShieldIcon class="size-4" aria-hidden="true" />
		</span>
		<span class="truncate text-sm font-semibold first-letter:uppercase" data-role-name>
			<bdi>{name}</bdi>
		</span>
		<Badge variant="secondary" class="max-w-full shrink" data-role-holders={role.holders}>
			<span class="truncate">
				{role.holders === 0
					? $LL.organization.roleCard.noHolders()
					: $LL.organization.roleCard.holders({ count: role.holders })}
			</span>
		</Badge>
	{/snippet}

	{#snippet content()}
		<div data-role-fields class="pointer-events-none relative grid grid-cols-2 gap-2">
			{@render field(
				EyeIcon,
				'reads',
				$LL.organization.roleCard.fields.reads(),
				kindsValue(reach.reads),
				reach.reads.held > 0
			)}
			{@render field(
				PencilIcon,
				'changes',
				$LL.organization.roleCard.fields.changes(),
				kindsValue(reach.changes),
				reach.changes.held > 0
			)}
			{@render field(
				UsersIcon,
				'people',
				$LL.organization.roleCard.fields.people(),
				actsValue(reach.people),
				reach.people.held > 0
			)}
			{@render field(
				Building2Icon,
				'organization',
				$LL.organization.roleCard.fields.organization(),
				actsValue(reach.organization),
				reach.organization.held > 0
			)}
		</div>
	{/snippet}
</RecordCard>
