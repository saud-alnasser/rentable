<script lang="ts">
	import { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { byRank, roleNameOf, roleWhoOf } from '$lib/organization/role';
	import type { OrganizationRole } from '$lib/organization/host';

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
	 * under the control it is about. *It stood under the tray until ticket 19 of effort 838.* A
	 * role refused for a reason of its own, which the caller answers through `refusalOf` (a flag
	 * the pick would move that the reader does not hold), is drawn refused with that reason under
	 * its name in the list, since it differs from role to role (ticket 45 of effort 838).
	 *
	 * **Where what the member may do differs from their role, the role reads as custom**, beside
	 * its name (effort 838, requirement 12 as amended 2026-09-27), with the dot each differing
	 * switch below carries, so the mark says what the dots are. The reset is in the head of the
	 * switches, beside what it puts back.
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
		refusalOf = () => null,
		custom = false,
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
		/** why one role in particular may not be chosen, or `null` where it may. */
		refusalOf?: (role: OrganizationRole) => string | null;
		/** whether what the member may do differs from the role chosen. */
		custom?: boolean;
		disabled: boolean;
		/** what the role was refused with, or `null`. */
		error?: string | null;
	} = $props();

	/** what the list marks as chosen: `value`, and put back on it where a pick is refused. */
	let shown = $derived(value);

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
				bind:value={shown}
				onValueChange={(next) => {
					const role = offered.find((candidate) => candidate.id === next);

					// a role refused for a flag stays in the keyboard's path with its reason, as
					// every refused act does (`rules/interface`); the pick itself is what is refused,
					// and the list is put back on the role chosen, or it would mark the refused one.
					if (next && role && !outOfReach(role) && refusalOf(role) === null) onPick(next);
					else shown = value;
				}}
				disabled={disabled || refusal !== null}
			>
				<Select.Trigger
					{id}
					aria-labelledby={`${id}-tray-legend`}
					class={cn('w-full sm:w-56', insetControl)}
					data-role-chosen={value}
				>
					<span class="flex min-w-0 items-center gap-2">
						<span class="truncate">{chosen ? nameOf(chosen) : ''}</span>
						{#if custom}
							<span
								class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
								data-role-custom
							>
								<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
								{$LL.organization.switches.custom()}
							</span>
						{/if}
					</span>
				</Select.Trigger>
				<Select.Content>
					{#each offered as role (role.id)}
						{@const reason = outOfReach(role) ? null : refusalOf(role)}
						<Select.Item
							value={role.id}
							label={nameOf(role)}
							disabled={outOfReach(role)}
							aria-disabled={reason !== null ? 'true' : undefined}
							data-role={role.id}
						>
							{#if reason}
								<div class="flex min-w-0 flex-col">
									<span>{nameOf(role)}</span>
									<span class="text-xs text-muted-foreground" data-role-item-refusal>
										{reason}
									</span>
								</div>
							{:else}
								{nameOf(role)}
							{/if}
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
