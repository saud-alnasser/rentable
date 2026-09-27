<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import PermissionSwitches from '$lib/organization/component/permission-switches.svelte';
	import { EVERY_FLAG, effective, permits, xorOf } from '@rentable/workspace-permission';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

	/**
	 * What a member may do, as the switches their role's editor draws, set to what they end up
	 * with (effort 838, requirement 12 as amended 2026-09-27).
	 *
	 * **The switches show the result, never the arithmetic.** A member's permissions are their
	 * role's mask exclusive-or'd with their override, and the override stays out of sight: a
	 * switch turned here writes the override that makes the member end up with what the switches
	 * say (the role exclusive-or'd with them). A switch that differs from the role carries a dot
	 * naming it, and where any does the member reads as custom beside their role in the tray
	 * above (`member-role.svelte`). *It was three columns, the role, a box meaning "changed" and
	 * the result, until the human saw the reader working the sum out on the running build.*
	 *
	 * **Reset puts them back on their role exactly**, clearing the override; it is drawn only
	 * where they are custom. Like the switches, it is the reader's only where every permission it
	 * would change is one they hold themselves, and it says why where it is not
	 * ([[rules/interface]], *Guidance*). Discord's *Sync Now* is the precedent.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one.** Where the reader
	 * may not change anybody's permissions at all, every switch is refused and the list says why,
	 * once.
	 *
	 * **Nothing is written from here.** The sheet's own submit writes the override.
	 */
	let {
		id,
		roleMask,
		roleName,
		override = $bindable(),
		held,
		refusal = null,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what the role chosen carries. */
		roleMask: number;
		/** what the role chosen is called, which the reset and the marks name. */
		roleName: string;
		/** the flags switched for this member alone. */
		override: number;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		held: number;
		/** why the reader may not change the override at all, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the override was refused with, or `null`. */
		error?: string | null;
	} = $props();

	const result = $derived(effective(roleMask, override));

	/** why the reset will not run, or `null` where it will. */
	const resetRefused = $derived(
		refusal ??
			(EVERY_FLAG.some((flag) => permits(override, flag) && !permits(held, flag))
				? $LL.organization.switches.resetNotHeld()
				: null)
	);

	const resetReasonId = $props.id();

	const reset = () => {
		if (resetRefused || disabled) return;

		override = 0;
	};
</script>

{#snippet resetControl()}
	<Tooltip.Root disabled={!resetRefused}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="ghost"
					size="sm"
					class={resetRefused ? unavailableControl : undefined}
					aria-disabled={resetRefused ? 'true' : undefined}
					aria-describedby={resetRefused ? resetReasonId : undefined}
					data-unavailable={resetRefused ? '' : undefined}
					{disabled}
					onclick={reset}
					data-role-reset
				>
					<RotateCcwIcon class="size-4" />
					{$LL.organization.switches.reset({ role: roleName })}
					{#if resetRefused}
						<span id={resetReasonId} class="sr-only">{resetRefused}</span>
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			<span data-unavailable-reason>{resetRefused}</span>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="override">
	<MemberSectionHead
		{id}
		legend={$LL.organization.override.legend()}
		control={override !== 0 ? resetControl : null}
	/>

	<PermissionSwitches
		{id}
		mask={result}
		onChange={(next) => {
			override = xorOf(roleMask, next);
		}}
		{held}
		{refusal}
		{disabled}
		baseline={{ mask: roleMask, name: roleName }}
	/>

	{#if error}
		<Field.Error data-sheet-error="override">{error}</Field.Error>
	{/if}
</Field.Set>
