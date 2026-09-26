<script lang="ts">
	import { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { byRank, roleNameOf, roleWhoOf } from '$lib/organization/role';
	import type { OrganizationRole } from '$lib/platform/host';

	/**
	 * A member's role, in the tray a member's sheet opens with: the one choice about the whole
	 * person, with the sentence that role means under it.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one** (ticket 42 of effort
	 * 832), so the role is the same tray, the same legend and the same control in both moments.
	 *
	 * **The roles are the organization's own records** (effort 838, requirement 5): the manager, the
	 * member, and whatever roles it made between them, highest first. So the chooser is a select over
	 * them rather than a segment per role, the way another record is chosen
	 * ([[rules/interface]], *Field kinds*); how many there are is the organization's to say. The
	 * owner's role is never offered: ownership moves a key and two rows, and is handed over by its
	 * own act on the owner's own card.
	 *
	 * **A role the reader may not give is drawn refused, never removed, and the tray says why**: a
	 * role at or above the reader's own rank is given by somebody above it (requirement 7). Where the
	 * reader may not give a role at all, the whole control is refused with the reason the caller
	 * hands in: the flag they lack, or that the card is their own. The reason stands in the tray,
	 * under the control it is about. *It stood under the tray until ticket 19 of effort 838.*
	 *
	 * **The tray is the directory's shape on a surface that is not a page** (the human's second
	 * look, effort 828): a card-coloured bar would be wrong inside a panel that is already one, so
	 * the shape is drawn here rather than borrowed from `directory-tray.svelte`.
	 */
	let {
		id,
		roles,
		value,
		onPick,
		readerRank,
		refusal = null,
		disabled,
		error = null
	}: {
		/** the control's id; the tray is `<id>-tray` and its legend `<id>-tray-legend`. */
		id: string;
		/** every role the organization has; the owner's is left out here. */
		roles: readonly OrganizationRole[];
		/** the id of the role chosen. */
		value: string;
		onPick: (roleId: string) => void;
		/** how high the reader's role stands: a role at or above it is not theirs to give. */
		readerRank: number;
		/** why the reader may not choose a role at all, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the role was refused with, or `null`. */
		error?: string | null;
	} = $props();

	const offered = $derived(byRank(roles).filter((role) => role.kind !== 'owner'));
	const chosen = $derived(offered.find((role) => role.id === value) ?? null);
	const nameOf = (role: OrganizationRole) => roleNameOf($LL, role);
	const outOfReach = (role: OrganizationRole) => role.rank >= readerRank;
	const anyOutOfReach = $derived(offered.some(outOfReach));
</script>

<Field.Set class="gap-3" aria-labelledby={`${id}-tray-legend`} data-sheet-section="role">
	<div
		data-sheet-tray={`${id}-tray`}
		class="flex flex-col gap-2 rounded-2xl bg-muted/30 px-3 py-2.5"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<Field.Legend id={`${id}-tray-legend`} variant="label" class="mb-0">
				{$LL.organization.dashboard.role()}
			</Field.Legend>

			<Select.Root
				type="single"
				{value}
				onValueChange={(next) => {
					if (next) onPick(next);
				}}
				disabled={disabled || refusal !== null}
			>
				<Select.Trigger
					{id}
					aria-labelledby={`${id}-tray-legend`}
					class={cn('w-full sm:w-56', insetControl)}
					data-role-chosen={value}
				>
					{chosen ? nameOf(chosen) : ''}
				</Select.Trigger>
				<Select.Content>
					{#each offered as role (role.id)}
						<Select.Item
							value={role.id}
							label={nameOf(role)}
							disabled={outOfReach(role)}
							data-role={role.id}
						>
							{nameOf(role)}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- under the control, and about what it holds now: who a built-in role is for. A role the
		     organization made says what it carries on the list below instead. -->
		{#if chosen && roleWhoOf($LL, chosen.kind)}
			<Field.Description data-role-who>{roleWhoOf($LL, chosen.kind)}</Field.Description>
		{/if}

		<!-- why, in the tray beside the control it is about: the whole choice where the reader may
		     make none, or the roles drawn refused in the list. -->
		{#if refusal}
			<Field.Description data-role-refusal>{refusal}</Field.Description>
		{:else if anyOutOfReach}
			<Field.Description data-role-refusal>
				{$LL.organization.dashboard.roleOutOfReach()}
			</Field.Description>
		{/if}
	</div>

	{#if error}
		<Field.Error data-sheet-error="role">{error}</Field.Error>
	{/if}
</Field.Set>
