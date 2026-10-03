<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Switch } from '@rentable/design/primitive/switch/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';

	/**
	 * One grant's switch, in or out, refused with its reason at the control.
	 *
	 * **Both ends of a grant draw it**: the member's card, one per workspace
	 * (`access/component/switches.svelte`), and a workspace's page, one per member
	 * (`workspace/component/holders.svelte`). Why it will not turn is the caller's, read from
	 * `accessRefusalOf` in `../access.ts`, so the two cannot refuse differently; how a refused
	 * switch behaves is this file's, so they cannot answer a press differently either.
	 *
	 * **A switch the reader may not turn is dimmed and says why**, as the permission switches do
	 * (`unavailableControl`): `aria-disabled` rather than disabled, so it stays in the tab order,
	 * the reason on hover and focus, and the reason again for assistive technology beside it. A
	 * press on it goes no further.
	 */
	let {
		id,
		name,
		checked,
		reason,
		describedBy = [],
		disabled,
		busy = false,
		onTurn,
		hook,
		size = 'default'
	}: {
		/** the control's id, which a label beside it names it by. */
		id: string;
		/** what the switch is named by: the workspace or the member the row is. */
		name: string;
		/** whether the row is in. */
		checked: boolean;
		/** why the switch will not turn, or `null` where it will. */
		reason: string | null;
		/** the ids of anything else the switch is read with, as a mark beside the row's name. */
		describedBy?: string[];
		/** whether no switch may turn for now, while a write runs. */
		disabled: boolean;
		/** whether this row's own write is running. */
		busy?: boolean;
		/** the row switched in (`true`) or out. Never called for a refused switch. */
		onTurn: (on: boolean) => void;
		/** the row id the switch is found by, `data-access-switch`. */
		hook: string;
		/** `lg` where the switch is the one control of a tile, as on a workspace's page. */
		size?: 'default' | 'lg';
	} = $props();

	const turn = (on: boolean) => {
		if (disabled || reason !== null) return;

		onTurn(on);
	};

	/** a press on a switch that will not turn is answered by its reason, and goes no further. */
	const refuse = (event: Event) => {
		if (reason !== null) event.preventDefault();
	};

	const refuseKey = (event: KeyboardEvent) => {
		if ((event.key === 'Enter' || event.key === ' ') && reason !== null) event.preventDefault();
	};

	const describedByIds = $derived(
		[...describedBy, reason ? `${id}-reason` : null].filter(Boolean).join(' ') || undefined
	);
</script>

<Tooltip.Root disabled={!reason}>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Switch
				{...props}
				{id}
				{checked}
				{size}
				onCheckedChange={turn}
				onclick={refuse}
				onkeydown={refuseKey}
				{disabled}
				aria-label={name}
				aria-disabled={reason ? 'true' : undefined}
				aria-busy={busy ? 'true' : undefined}
				aria-describedby={describedByIds}
				class={reason ? unavailableControl : undefined}
				data-access-switch={hook}
				data-unavailable={reason ? '' : undefined}
			/>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>
		<span data-unavailable-reason>{reason}</span>
	</Tooltip.Content>
</Tooltip.Root>
{#if reason}
	<span id={`${id}-reason`} class="sr-only">{reason}</span>
{/if}
