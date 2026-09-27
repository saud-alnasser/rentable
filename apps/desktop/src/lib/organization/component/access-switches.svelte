<script lang="ts" module>
	import type { AccessRow } from '$lib/organization/component/access-dialog.svelte';

	/**
	 * one grant a switch can put somebody in: what is held on it today, and whether the reader
	 * holds the workspace at full access themselves, which is what putting somebody in gives.
	 */
	export type AccessSwitchRow = AccessRow & { givable: boolean };
</script>

<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Switch } from '@rentable/design/primitive/switch/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import type BuildingIcon from '@lucide/svelte/icons/building';
	import type { Snippet } from 'svelte';

	/**
	 * Grants as switches, one row each, in or out (effort 838, requirement 12 as amended a third
	 * time 2026-09-27, the human's call).
	 *
	 * **A grant has two ends, and both draw it here.** A member's card lists the workspaces the
	 * member could be in (`member-workspaces.svelte`); a workspace's own dialog lists the people
	 * who could hold it (`access-dialog.svelte`). The rows are whichever end the caller is at, so
	 * who may turn what is decided once and the two cannot refuse differently. *The workspace's
	 * dialog kept a row of three levels after the card had its switches, until ticket 49 of effort
	 * 838 drew it from this too.*
	 *
	 * **A row is in or out.** On is a full-access grant and off is none. Beneath a row that is in,
	 * the caller may draw what belongs to it (`beneath`): the member's card draws what the member
	 * may do in that workspace, tailored. A row is a quiet ring headed by its glyph, as the
	 * permission switch list draws a kind of record; the glyph is the caller's, the thing each row
	 * is, and a short mark may sit beside its name (`markOf`), which the workspace's dialog uses to
	 * say a person is tailored there. *Beneath a row that was in sat the owner's lock to read only
	 * until the third amendment of requirement 12 made read only a preset of the switches.*
	 *
	 * **The acts are the ones that exist.** Switching on grants full access and off withdraws, each
	 * handed up as the level it comes to through `onPick`; the caller writes only the rows that
	 * changed. Turning a row back on after turning it off puts back what it held, a grant minted
	 * read only included, so nothing moves.
	 *
	 * **A switch the reader may not turn is dimmed and says why**, as the permission switches do
	 * (`unavailableControl`): `aria-disabled` rather than disabled, the reason on hover and focus,
	 * and each distinct reason said once above the list. The reasons are the refusals Rust makes:
	 * every switch where the caller says the reader may turn none (`refusal`, the card's reader
	 * without `grantWorkspace`); putting somebody in a workspace the reader holds read only, since
	 * full access is the reader's own credential re-sealed, unless it puts back what the row held,
	 * which writes nothing; and switching out a row whose grant the owner minted read only, for
	 * anybody but the owner, since Rust keeps changing such a grant the owner's.
	 */
	let {
		rowPrefix,
		rows,
		access,
		onPick,
		readerIsOwner = false,
		icon: Icon,
		refusal = null,
		disabled,
		beneath,
		markOf = () => null
	}: {
		/** what each row's switch is named by: `<rowPrefix>-<row id>`. */
		rowPrefix: string;
		/** every row a grant can be held on, with what is held on it today. */
		rows: AccessSwitchRow[];
		/** the level chosen per row, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/**
		 * whether the reader is the owner, who alone changes a grant minted read only: Rust asks
		 * for the owner to withdraw one.
		 */
		readerIsOwner?: boolean;
		/** the glyph every row leads with: the concept each row is. */
		icon: typeof BuildingIcon;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the caller draws beneath a row that is in, if anything. */
		beneath?: Snippet<[AccessSwitchRow]>;
		/** a short word beside a row's name, or `null` for none. */
		markOf?: (row: AccessSwitchRow) => string | null;
	} = $props();

	const levelOf = (row: AccessSwitchRow) => access[row.id] ?? row.access;

	const isIn = (row: AccessSwitchRow) => levelOf(row) !== 'none';

	/** what switching a row on comes to: what the row held, or a full-access grant. */
	const inLevel = (row: AccessSwitchRow): AccessChoice =>
		row.access === 'none' ? 'full-access' : row.access;

	/** why the row's switch will not turn, or `null` where it will. */
	const inReason = (row: AccessSwitchRow): string | null => {
		if (refusal) return refusal;

		// off is a withdrawal, which every holder of the act may make, but for a grant the owner
		// minted read only, which Rust keeps the owner's to change.
		if (isIn(row)) {
			return row.access === 'read-only' && !readerIsOwner
				? $LL.organization.workspaceSwitches.ownerMadeReadOnly()
				: null;
		}

		// back on is what the row held, which is no change and writes nothing.
		if (row.access !== 'none') return null;

		return row.givable ? null : $LL.organization.workspaceSwitches.notHeld();
	};

	/** each reason a drawn switch is dimmed for, once, in the order the rows meet them. */
	const reasons = $derived([
		...new Set(rows.map(inReason).filter((reason): reason is string => reason !== null))
	]);

	const turnIn = (row: AccessSwitchRow, on: boolean) => {
		if (disabled || inReason(row) !== null) return;

		onPick(row.id, on ? inLevel(row) : 'none');
	};

	/** a press on a switch that will not turn is answered by its reason, and goes no further. */
	const refuse = (reason: string | null) => (event: Event) => {
		if (reason !== null) event.preventDefault();
	};

	const refuseKey = (reason: string | null) => (event: KeyboardEvent) => {
		if ((event.key === 'Enter' || event.key === ' ') && reason !== null) event.preventDefault();
	};
</script>

<!-- why a switch is dimmed, each reason once, above them all, as the permission switches say
     theirs; the switch itself says it again on hover and focus. -->
{#each reasons as reason (reason)}
	<Field.Description data-access-refusal>{reason}</Field.Description>
{/each}

{#each rows as row (row.id)}
	{@const controlId = `${rowPrefix}-${row.id}`}
	{@const reason = inReason(row)}
	{@const mark = markOf(row)}
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
			{#if mark}
				<span
					id={`${controlId}-mark`}
					class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
					data-access-mark={row.id}
				>
					<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
					{mark}
				</span>
			{/if}
			<Tooltip.Root disabled={!reason}>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Switch
							{...props}
							id={controlId}
							checked={isIn(row)}
							onCheckedChange={(on) => turnIn(row, on)}
							onclick={refuse(reason)}
							onkeydown={refuseKey(reason)}
							{disabled}
							aria-label={row.name}
							aria-disabled={reason ? 'true' : undefined}
							aria-describedby={[
								mark ? `${controlId}-mark` : null,
								reason ? `${controlId}-reason` : null
							]
								.filter(Boolean)
								.join(' ') || undefined}
							class={reason ? unavailableControl : undefined}
							data-access-switch={row.id}
							data-unavailable={reason ? '' : undefined}
						/>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>
					<span data-unavailable-reason>{reason}</span>
				</Tooltip.Content>
			</Tooltip.Root>
			{#if reason}
				<span id={`${controlId}-reason`} class="sr-only">{reason}</span>
			{/if}
		</div>

		<!-- beneath a row that is in, and only then: what the caller hangs off it. -->
		{#if beneath && isIn(row)}
			{@render beneath(row)}
		{/if}
	</div>
{/each}
