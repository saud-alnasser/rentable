<script lang="ts" module>
	import type { AccessRow } from '$lib/organization/component/access-dialog.svelte';

	/**
	 * one workspace a member can be put in: what they hold on it today, and whether the reader
	 * holds it at full access themselves, which is what putting somebody in gives.
	 */
	export type MemberWorkspaceRow = AccessRow & { givable: boolean };
</script>

<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Switch } from '@rentable/design/primitive/switch/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import BuildingIcon from '@lucide/svelte/icons/building';

	/**
	 * The workspaces a member is in, as one switch each (effort 838, requirement 12 as amended
	 * again 2026-09-27, the human's call on the running application).
	 *
	 * **A workspace is in or out.** On is a full-access grant and off is none, so the card reads as
	 * the member's role and the places they can open, and not as a second set of permissions
	 * beside the role. *Each workspace was a row of three levels, full access, read only and no
	 * access, until the human saw it beside the switch list and read it as a second permission
	 * system.*
	 *
	 * **Beneath a workspace that is in, a mini switch locks it to read only**, with the one line
	 * that says what that is: nothing in it can be changed by this member, even outside the
	 * application, which is the one limit a role cannot give. It is the Human Interface
	 * Guidelines' primary switch with a mini switch under it (*Toggles*), drawn as the permission
	 * switch list draws a kind of record, a quiet ring headed by its glyph, so the two lists on
	 * the card read as one. The glyph is the workspaces section's building ([[rules/frontend]]: a
	 * concept keeps one glyph everywhere it appears).
	 *
	 * **The acts are the ones that exist.** Switching on grants full access, off withdraws, locking
	 * grants read only and unlocking grants full access again, each handed up as the level it
	 * comes to through `onPick`; the caller writes only the rows that changed. Turning a workspace
	 * back on after turning it off puts back what the row held, so nothing moves.
	 *
	 * **A switch the reader may not turn is dimmed and says why**, as the permission switches do
	 * (`unavailableControl`): `aria-disabled` rather than disabled, the reason on hover and focus,
	 * and each distinct reason said once above the list. The reasons are the refusals Rust makes:
	 * the whole list without `grantWorkspace`; putting somebody in a workspace the reader holds
	 * read only, since full access is the reader's own credential re-sealed; and the lock for
	 * anybody but the owner, since only the owner's account mints a read-only credential. A lock
	 * already on stays drawn on: what is refused is changing it, not reading it.
	 */
	let {
		id,
		rowPrefix,
		description,
		empty,
		rows,
		access,
		onPick,
		canGrantReadOnly,
		refusal = null,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what each row's switch is named by: `<rowPrefix>-<workspace id>`, and its lock `-lock`. */
		rowPrefix: string;
		/** the one sentence under the section's name, which is the moment's own. */
		description: string;
		/** what stands in the section when there is no workspace to hold. */
		empty: string;
		/** every workspace a grant can be held on, with what the member holds on it today. */
		rows: MemberWorkspaceRow[];
		/** the level chosen per workspace, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the grants were refused with, or `null`. */
		error?: string | null;
	} = $props();

	const levelOf = (row: MemberWorkspaceRow) => access[row.id] ?? row.access;

	const isIn = (row: MemberWorkspaceRow) => levelOf(row) !== 'none';

	const isLocked = (row: MemberWorkspaceRow) => levelOf(row) === 'read-only';

	/** what switching a workspace on comes to: what the row held, or a full-access grant. */
	const inLevel = (row: MemberWorkspaceRow): AccessChoice =>
		row.access === 'none' ? 'full-access' : row.access;

	/** why the workspace's own switch will not turn, or `null` where it will. */
	const inReason = (row: MemberWorkspaceRow): string | null => {
		if (refusal) return refusal;

		// off is a withdrawal, which every holder of the act may make.
		if (isIn(row)) return null;

		return inLevel(row) === 'full-access' && !row.givable
			? $LL.organization.workspaceSwitches.notHeld()
			: null;
	};

	/** why the lock will not turn, or `null` where it will. */
	const lockReason = (row: MemberWorkspaceRow): string | null => {
		if (refusal) return refusal;

		if (!canGrantReadOnly) return $LL.organization.workspaceSwitches.lockIsTheOwners();

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

	const turnIn = (row: MemberWorkspaceRow, on: boolean) => {
		if (disabled || inReason(row) !== null) return;

		onPick(row.id, on ? inLevel(row) : 'none');
	};

	const turnLock = (row: MemberWorkspaceRow, on: boolean) => {
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
	data: Record<string, string>
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
					aria-describedby={reason ? `${controlId}-reason` : undefined}
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

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="workspaces">
	<MemberSectionHead {id} legend={$LL.settings.section.workspaces()} {description} />

	{#if rows.length === 0}
		<Field.Description data-access-empty>{empty}</Field.Description>
	{/if}

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
				<BuildingIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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

			<!-- beneath a workspace the member is in, and only then: the one limit a role cannot
			     give, with what it means under its name. Indented to the name, so the glyph's
			     column stays the row's. -->
			{#if isIn(row)}
				<div class="flex min-h-7 items-center gap-2 ps-6" data-access-lock-row={row.id}>
					<div class="flex min-w-0 flex-1 flex-col">
						<Field.Label for={`${controlId}-lock`} class="font-normal">
							{$LL.organization.workspaceSwitches.lock()}
						</Field.Label>
						<span class="text-xs leading-snug text-muted-foreground" data-access-says={row.id}>
							{$LL.organization.workspaceSwitches.locked()}
						</span>
					</div>
					{@render toggle(
						`${controlId}-lock`,
						isLocked(row),
						$LL.organization.workspaceSwitches.lockNamed({ workspace: row.name }),
						'sm',
						lockReason(row),
						(on) => turnLock(row, on),
						{ 'data-access-lock': row.id }
					)}
				</div>
			{/if}
		</div>
	{/each}

	{#if error}
		<Field.Error data-sheet-error="workspaces">{error}</Field.Error>
	{/if}
</Field.Set>
