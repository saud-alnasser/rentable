<script lang="ts" module>
	import type { AccessSwitchRow } from '$lib/organization/access/access';

	/**
	 * one member a workspace can be held by: what they hold on it today, their role's name, and
	 * whether what they may do there is tailored.
	 */
	export type HolderRow = AccessSwitchRow & { role: string; tailored: boolean };
</script>

<script lang="ts">
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { columnsFor, RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import { accessRefusalOf, inLevelOf, type AccessChoice } from '$lib/organization/access/access';
	import AccessSwitch from '$lib/organization/access/component/access-switch.svelte';
	import { accountInitials } from '$lib/sync';

	/**
	 * The people who could hold a workspace, each in or out, on the workspace's page (effort 846,
	 * ticket 49, at the human's word of 2026-10-03: "manage members in the workspaces the form
	 * looks bad the switch it needs to be a better looking maybe a page details like how records
	 * have pages record and dicreocty of members").
	 *
	 * **A tile per member, in the members directory's family**: their initials in the disc the
	 * member card draws, their name and their role's badge on the heading line, and under the name
	 * what they are here in words, *in this workspace* or *not in this workspace*, so the state is
	 * read without the switch's position alone. The tiles are a grid, as many to a row as there is
	 * room for at the record tiles' width (`columnsFor`), in source order. A tile is not a link: the
	 * member's own card is in the organization section, and on this page the tile is what is turned.
	 *
	 * **The control is the switch, at its large size** ([[contexts/desktop/components]]: a workspace
	 * a member is in is a switch), the tile's one control at its trailing edge, named for the member
	 * and labelled by the name beside it. A tile that is in takes the primary tone on its ring, so
	 * who holds the workspace reads down the grid at a glance. *The dialog it replaced drew the
	 * default switch in a faint ring per row, under one save; the human found it looked bad.*
	 *
	 * **It applies at once** (requirement 4): a switch turned hands its row up through `onPick`,
	 * and the page writes it. While a write runs every switch waits, the one being written marked
	 * busy.
	 *
	 * **The refusals are the member's card's** (`accessRefusalOf`, `access-switch.svelte`): every
	 * switch where the reader may turn none (`refusal`, the reader without `grantWorkspace`), and
	 * putting somebody in where the reader holds the workspace read only, since full access is
	 * the reader's own credential re-sealed. Each reason is said once above the tiles and again at
	 * the switch. A person tailored here is marked *custom here* while they are in; the tailoring
	 * itself is on their card. Who is listed is the caller's: never the owner, whose grant is never
	 * withdrawn, and never the reader, who does not write their own row.
	 */
	let {
		rows,
		access,
		onPick,
		refusal = null,
		writing
	}: {
		/** every member a grant can be held by, with what each holds today. */
		rows: HolderRow[];
		/** the level chosen per row, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		/** the row whose write is running, or `null`. */
		writing: string | null;
	} = $props();

	const levelOf = (row: HolderRow) => access[row.id] ?? row.access;

	const isIn = (row: HolderRow) => levelOf(row) !== 'none';

	const inReason = (row: HolderRow): string | null =>
		accessRefusalOf(row, levelOf(row), refusal, $LL.organization.workspaceSwitches.notHeld());

	/** each reason a drawn switch is dimmed for, once, in the order the rows meet them. */
	const reasons = $derived([
		...new Set(rows.map(inReason).filter((reason): reason is string => reason !== null))
	]);

	/** the gap between two tiles, the list shell's `gap-3`. */
	const TILE_GAP = 12;
	let width = $state(0);
	const columns = $derived(columnsFor(width, RECORD_TILE_MIN_WIDTH, TILE_GAP));
</script>

{#if rows.length === 0}
	<Field.Description data-access-empty>
		{$LL.organization.dashboard.noMemberToGrant()}
	</Field.Description>
{/if}

<!-- why a switch is dimmed, each reason once, above the tiles; the switch says it again. -->
{#each reasons as reason (reason)}
	<Field.Description data-access-refusal>{reason}</Field.Description>
{/each}

<div
	class="grid gap-3"
	style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
	bind:clientWidth={width}
	data-holders
	data-columns={columns}
>
	{#each rows as row (row.id)}
		{@const controlId = `holder-${row.id}`}
		{@const held = isIn(row)}
		{@const marked = row.tailored && held}
		<div
			class={[
				'flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-raised ring-1 transition-[box-shadow] duration-quick ease-move',
				held ? 'ring-primary/40' : 'ring-foreground/5'
			]}
			data-access-row={row.id}
			data-access-in={held ? '' : undefined}
		>
			<!-- the same disc the member card draws, dimmed while the member is out. -->
			<Avatar.Root class={['size-9 shrink-0 rounded-full', !held && 'opacity-60']}>
				<Avatar.Fallback class="rounded-full text-xs">
					{accountInitials(row.name)}
				</Avatar.Fallback>
			</Avatar.Root>

			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<div class="flex min-w-0 items-center gap-2">
					<Field.Label for={controlId} class="block min-w-0 truncate text-sm font-semibold">
						<bdi>{row.name}</bdi>
					</Field.Label>
					<Badge variant="secondary" class="max-w-full min-w-0 shrink" data-member-role>
						<bdi class="truncate">{row.role}</bdi>
					</Badge>
				</div>

				<div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<span class="truncate" data-access-state={held ? 'in' : 'out'}>
						{held ? $LL.organization.workspacePage.isIn() : $LL.organization.workspacePage.isOut()}
					</span>
					{#if marked}
						<span
							id={`${controlId}-mark`}
							class="flex shrink-0 items-center gap-1.5"
							data-access-mark={row.id}
						>
							<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
							{$LL.organization.workspaceSwitches.customHere()}
						</span>
					{/if}
				</div>
			</div>

			<AccessSwitch
				id={controlId}
				name={row.name}
				checked={held}
				reason={inReason(row)}
				describedBy={marked ? [`${controlId}-mark`] : []}
				disabled={writing !== null}
				busy={writing === row.id}
				hook={row.id}
				size="lg"
				onTurn={(on) => onPick(row.id, on ? inLevelOf(row) : 'none')}
			/>
		</div>
	{/each}
</div>
