<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		accessRefusalOf,
		inLevelOf,
		type AccessChoice,
		type AccessSwitchRow
	} from '$lib/organization/access/access';
	import AccessSwitch from './access-switch.svelte';
	import type BuildingIcon from '@lucide/svelte/icons/building';
	import type { Snippet } from 'svelte';

	/**
	 * A member's grants as switches, one row per workspace, in or out (effort 838, requirement 12
	 * as amended a third time 2026-09-27, the human's call).
	 *
	 * **A grant has two ends, and both give it on the same terms.** A member's card lists the
	 * workspaces the member could be in, here (`member/component/workspaces.svelte`); a workspace's
	 * page finds the people who could hold it by search and lists who does as cards
	 * (`workspace/component/page.svelte`). Both write through one access write and refuse a grant
	 * as Rust does: without `grantWorkspace`, and afresh on a workspace the reader holds read only.
	 * *The workspace's end was a dialog drawn from this list until ticket 49 of effort 846, and a
	 * tile per member with this switch until ticket 50.*
	 *
	 * **A row is in or out.** On is a full-access grant and off is none. Beneath a row that is in,
	 * the caller may draw what belongs to it (`beneath`): the member's card draws the member's
	 * permissions in that workspace, folded. A row is a quiet ring headed by its glyph, as the
	 * permission switch list draws a group; the glyph is the caller's, the thing each row is.
	 * *Beneath a row that was in sat the owner's lock to read only until the third amendment of
	 * requirement 12 made read only a preset of the switches.*
	 *
	 * **The acts are the ones that exist.** Switching on grants full access and off withdraws, each
	 * handed up as the level it comes to through `onPick`; the caller writes only the rows that
	 * changed. Turning a row back on after turning it off puts back what it held, a grant minted
	 * read only included, so nothing moves.
	 *
	 * **Each distinct reason a switch is dimmed for is said once above the list**, and the switch
	 * says it again on hover and focus. *Switching out a row whose grant the owner minted read only
	 * was the owner's alone until review round one of the workspace layer let the rule go with the
	 * lock.*
	 */
	let {
		rowPrefix,
		rows,
		access,
		onPick,
		icon: Icon,
		refusal = null,
		disabled,
		beneath
	}: {
		/** what each row's switch is named by: `<rowPrefix>-<row id>`. */
		rowPrefix: string;
		/** every row a grant can be held on, with what is held on it today. */
		rows: AccessSwitchRow[];
		/** the level chosen per row, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/** the glyph every row leads with: the concept each row is. */
		icon: typeof BuildingIcon;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the caller draws beneath a row that is in, if anything. */
		beneath?: Snippet<[AccessSwitchRow]>;
	} = $props();

	const levelOf = (row: AccessSwitchRow) => access[row.id] ?? row.access;

	const isIn = (row: AccessSwitchRow) => levelOf(row) !== 'none';

	/** why the row's switch will not turn, or `null` where it will. */
	const inReason = (row: AccessSwitchRow): string | null =>
		accessRefusalOf(row, levelOf(row), refusal, $LL.organization.workspaceSwitches.notHeld());

	/** each reason a drawn switch is dimmed for, once, in the order the rows meet them. */
	const reasons = $derived([
		...new Set(rows.map(inReason).filter((reason): reason is string => reason !== null))
	]);
</script>

<!-- why a switch is dimmed, each reason once, above them all, as the permission switches say
     theirs; the switch itself says it again on hover and focus. -->
{#each reasons as reason (reason)}
	<Field.Description data-access-refusal>{reason}</Field.Description>
{/each}

{#each rows as row (row.id)}
	{@const controlId = `${rowPrefix}-${row.id}`}
	<div
		class="flex flex-col gap-1 rounded-2xl px-3 py-2 ring-1 ring-foreground/5"
		data-access-row={row.id}
		data-access-in={isIn(row) ? '' : undefined}
	>
		<div class="flex min-h-8 items-center gap-2">
			<Icon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<Field.Label for={controlId} class="block min-w-0 flex-1 truncate">
				<bdi>{row.name}</bdi>
			</Field.Label>
			<AccessSwitch
				id={controlId}
				name={row.name}
				checked={isIn(row)}
				reason={inReason(row)}
				{disabled}
				hook={row.id}
				onTurn={(on) => onPick(row.id, on ? inLevelOf(row) : 'none')}
			/>
		</div>

		<!-- beneath a row that is in, and only then: what the caller hangs off it. -->
		{#if beneath && isIn(row)}
			{@render beneath(row)}
		{/if}
	</div>
{/each}
