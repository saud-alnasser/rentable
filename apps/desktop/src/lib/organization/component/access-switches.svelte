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

	/**
	 * Grants as switches, one row each: in or out, and beneath one that is in, the owner's lock to
	 * read only (effort 838, requirement 12 as amended again 2026-09-27, the human's call on the
	 * running application).
	 *
	 * **A grant has two ends, and both draw it here.** A member's card lists the workspaces the
	 * member could be in (`member-workspaces.svelte`); a workspace's own dialog lists the people
	 * who could hold it (`access-dialog.svelte`). The rows are whichever end the caller is at, so
	 * who may turn what is decided once and the two cannot refuse differently. *The workspace's
	 * dialog kept a row of three levels after the card had its switches, until ticket 49 of effort
	 * 838 drew it from this too.*
	 *
	 * **A row is in or out.** On is a full-access grant and off is none. Beneath a row that is in,
	 * a mini switch locks it to read only, with the one line that says what that is: nothing in
	 * the workspace can be changed by that member, even outside the application, which is the one
	 * limit a role cannot give. It is the Human Interface Guidelines' primary switch with a mini
	 * switch under it (*Toggles*), drawn as the permission switch list draws a kind of record, a
	 * quiet ring headed by its glyph. The glyph is the caller's: the thing each row is.
	 *
	 * **The acts are the ones that exist.** Switching on grants full access, off withdraws, locking
	 * grants read only and unlocking grants full access again, each handed up as the level it
	 * comes to through `onPick`; the caller writes only the rows that changed. Turning a row back
	 * on after turning it off puts back what it held, so nothing moves.
	 *
	 * **A switch the reader may not turn is dimmed and says why**, as the permission switches do
	 * (`unavailableControl`): `aria-disabled` rather than disabled, the reason on hover and focus,
	 * and each distinct reason said once above the list. The reasons are the refusals Rust makes:
	 * every switch where the caller says the reader may turn none (`refusal`, the card's reader
	 * without `grantWorkspace`); putting somebody in a workspace the reader holds read only, since
	 * full access is the reader's own credential re-sealed, unless it puts back what the row held,
	 * which writes nothing; and the lock for anybody but the owner, since only the owner's Turso
	 * account mints a read-only credential, and for the owner on a machine that does not hold that
	 * account's authority, which Rust refuses the same way. A lock already on stays drawn on: what
	 * is refused is changing it, not reading it.
	 *
	 * **The lock's line is read with it.** What locking does is said under its name, tied to the
	 * lock by `aria-describedby` beside any reason it is refused for, so a screen reader hears what
	 * the switch would do before it is turned.
	 */
	let {
		rowPrefix,
		rows,
		access,
		onPick,
		canGrantReadOnly,
		readerIsOwner = false,
		icon: Icon,
		lockLabel,
		refusal = null,
		disabled
	}: {
		/** what each row's switch is named by: `<rowPrefix>-<row id>`, and its lock `-lock`. */
		rowPrefix: string;
		/** every row a grant can be held on, with what is held on it today. */
		rows: AccessSwitchRow[];
		/** the level chosen per row, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/**
		 * whether the reader may lock a row: they are the owner, and this machine holds the Turso
		 * authority, which is what mints a read only credential.
		 */
		canGrantReadOnly: boolean;
		/**
		 * whether the reader is the owner, which names why the lock is refused where
		 * `canGrantReadOnly` is false: this machine is not connected to the Turso account, rather
		 * than the lock being somebody else's.
		 */
		readerIsOwner?: boolean;
		/** the glyph every row leads with: the concept each row is. */
		icon: typeof BuildingIcon;
		/** the lock's accessible name on a row, which names what the row is. */
		lockLabel: (row: AccessSwitchRow) => string;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
	} = $props();

	const levelOf = (row: AccessSwitchRow) => access[row.id] ?? row.access;

	const isIn = (row: AccessSwitchRow) => levelOf(row) !== 'none';

	const isLocked = (row: AccessSwitchRow) => levelOf(row) === 'read-only';

	/** what switching a row on comes to: what the row held, or a full-access grant. */
	const inLevel = (row: AccessSwitchRow): AccessChoice =>
		row.access === 'none' ? 'full-access' : row.access;

	/** why the row's own switch will not turn, or `null` where it will. */
	const inReason = (row: AccessSwitchRow): string | null => {
		if (refusal) return refusal;

		// off is a withdrawal, which every holder of the act may make.
		if (isIn(row)) return null;

		// back on is what the row held, which is no change and writes nothing.
		if (inLevel(row) === row.access && row.access !== 'none') return null;

		return inLevel(row) === 'full-access' && !row.givable
			? $LL.organization.workspaceSwitches.notHeld()
			: null;
	};

	/** why the lock will not turn, or `null` where it will. */
	const lockReason = (row: AccessSwitchRow): string | null => {
		if (refusal) return refusal;

		if (!canGrantReadOnly) {
			return readerIsOwner
				? $LL.common.refusals.host.tursoNotConnected()
				: $LL.organization.workspaceSwitches.lockIsTheOwners();
		}

		return isLocked(row) && !row.givable ? $LL.organization.workspaceSwitches.notHeld() : null;
	};

	/** each reason a drawn switch is dimmed for, once, in the order the rows meet them. */
	const reasons = $derived([
		...new Set(
			rows.flatMap((row) =>
				[inReason(row), isIn(row) ? lockReason(row) : null].filter(
					(reason): reason is string => reason !== null
				)
			)
		)
	]);

	const turnIn = (row: AccessSwitchRow, on: boolean) => {
		if (disabled || inReason(row) !== null) return;

		onPick(row.id, on ? inLevel(row) : 'none');
	};

	const turnLock = (row: AccessSwitchRow, on: boolean) => {
		if (disabled || lockReason(row) !== null) return;

		onPick(row.id, on ? 'read-only' : 'full-access');
	};

	/** a press on a switch that will not turn is answered by its reason, and goes no further. */
	const refuse = (reason: string | null) => (event: Event) => {
		if (reason !== null) event.preventDefault();
	};

	const refuseKey = (reason: string | null) => (event: KeyboardEvent) => {
		if ((event.key === 'Enter' || event.key === ' ') && reason !== null) event.preventDefault();
	};
</script>

{#snippet toggle(
	controlId: string,
	checked: boolean,
	label: string,
	size: 'default' | 'sm',
	reason: string | null,
	onTurn: (on: boolean) => void,
	data: Record<string, string>,
	describedBy: string | null = null
)}
	<Tooltip.Root disabled={!reason}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Switch
					{...props}
					{...data}
					id={controlId}
					{size}
					{checked}
					onCheckedChange={onTurn}
					onclick={refuse(reason)}
					onkeydown={refuseKey(reason)}
					{disabled}
					aria-label={label}
					aria-disabled={reason ? 'true' : undefined}
					aria-describedby={[describedBy, reason ? `${controlId}-reason` : null]
						.filter(Boolean)
						.join(' ') || undefined}
					class={reason ? unavailableControl : undefined}
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
{/snippet}

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
			{@render toggle(
				controlId,
				isIn(row),
				row.name,
				'default',
				inReason(row),
				(on) => turnIn(row, on),
				{ 'data-access-switch': row.id }
			)}
		</div>

		<!-- beneath a row that is in, and only then: the one limit a role cannot give, with what it
		     means under its name. Indented to the name, so the glyph's column stays the row's. -->
		{#if isIn(row)}
			<div class="flex min-h-7 items-center gap-2 ps-6" data-access-lock-row={row.id}>
				<div class="flex min-w-0 flex-1 flex-col">
					<Field.Label for={`${controlId}-lock`} class="font-normal">
						{$LL.organization.workspaceSwitches.lock()}
					</Field.Label>
					<span
						id={`${controlId}-lock-says`}
						class="text-xs leading-snug text-muted-foreground"
						data-access-says={row.id}
					>
						{$LL.organization.workspaceSwitches.locked()}
					</span>
				</div>
				{@render toggle(
					`${controlId}-lock`,
					isLocked(row),
					lockLabel(row),
					'sm',
					lockReason(row),
					(on) => turnLock(row, on),
					{ 'data-access-lock': row.id },
					`${controlId}-lock-says`
				)}
			</div>
		{/if}
	</div>
{/each}
