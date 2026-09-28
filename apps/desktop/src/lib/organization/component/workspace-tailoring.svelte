<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import PermissionSwitches from '$lib/organization/component/permission-switches.svelte';
	import {
		firstUnheldTailored,
		isTailored,
		readOnlyTailoring,
		recordsOf,
		resetTailoring,
		tailoredShown,
		tailoredTo,
		writesAny,
		type WorkspaceTailoring
	} from '$lib/organization/role';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

	/**
	 * What a member may do in one workspace they are in, beneath its switch on their card (effort
	 * 838, requirement 12 as amended a third time 2026-09-27, the human's call: "tailor the
	 * workspace-scoped override permission, that's it, with preset buttons that reset and read
	 * only").
	 *
	 * **Folded by default, and one line when folded**: *tailor for this workspace*, reading
	 * *custom* beside it where anything is set here, or what the member may do here differs from
	 * what they may do across the organization. Opened, it is the record groups of the switch list
	 * the role editor and the card share (`permission-switches.svelte`, `records`), set to what the
	 * member ends up with there. That is the Human Interface Guidelines' disclosure: detail a
	 * reader asks for, kept out of sight until then (*Disclosure controls*).
	 *
	 * **What is tailored is pinned** (review round one, the human's call). A switch turned is set
	 * for this workspace at its new value, and holds it whatever is later changed for the member
	 * across the organization; a switch never turned follows that. Each switch set here carries a
	 * dot saying so, and a folded head its *custom* mark.
	 *
	 * **Two presets above the switches.** *Read only* sets every add, edit and delete off here, for
	 * every kind of record, and leaves each view as it is; it reads pressed while no write is on,
	 * which is how a grant minted read only before the lock left is drawn. *Reset* sets nothing
	 * here, drawn only where the workspace is custom. Neither mints a credential: read only is
	 * these switches, enforced by the application.
	 *
	 * **A switch turned hands up what the workspace comes to** (`tailoredTo`): what is set here
	 * and at what value, and a full-access grant where a grant minted read only has a write turned
	 * on.
	 *
	 * **A control the reader may not use says why**, as the switch list's do: every one where the
	 * reader lacks `overrideMember` (`refusal`); a change that would set or unset a flag the reader
	 * does not hold, since Rust signs the row under the reader's certificate; and turning a write
	 * on over a grant minted read only where re-granting it full access would be refused
	 * (`regrantRefusal`).
	 */
	let {
		id,
		organizationWide,
		held,
		value,
		onChange,
		readerPermissions,
		refusal = null,
		regrantRefusal = null,
		disabled
	}: {
		/** what the fold and its switches are named by in the document. */
		id: string;
		/** what the member may do across the organization, as the card has it now. */
		organizationWide: number;
		/** what the workspace holds before this save: its grant's level and what is set there. */
		held: WorkspaceTailoring;
		/** what the workspace comes to as the switches stand. */
		value: WorkspaceTailoring;
		onChange: (value: WorkspaceTailoring) => void;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		/** why the reader may change nothing here, or `null` where they may. */
		refusal?: string | null;
		/** why re-granting this workspace at full access would be refused, or `null`. */
		regrantRefusal?: string | null;
		disabled: boolean;
	} = $props();

	let open = $state(false);

	const shown = $derived(tailoredShown(organizationWide, value));
	const custom = $derived(isTailored(organizationWide, value));
	const readOnly = $derived(!writesAny(shown));

	/** why a workspace coming to `next` would be refused, beyond the flag a switch names. */
	const refusalOfPlan = (next: WorkspaceTailoring): string | null => {
		if (next.access === 'full-access' && held.access === 'read-only' && regrantRefusal) {
			return regrantRefusal;
		}

		return firstUnheldTailored(readerPermissions, held, next)
			? $LL.organization.workspaceSwitches.movesNotHeld()
			: null;
	};

	const planOf = (next: number) => tailoredTo(organizationWide, held, value, next);

	const readOnlyRefused = $derived(refusal ?? refusalOfPlan(readOnlyTailoring(held, value)));
	const resetRefused = $derived(refusal ?? refusalOfPlan(resetTailoring(organizationWide, held)));

	const press = (reason: string | null, next: () => WorkspaceTailoring) => () => {
		if (disabled || reason) return;

		onChange(next());
	};
</script>

<!-- a preset: read only, which reads pressed while it holds, or the reset. -->
{#snippet preset(
	kind: 'read-only' | 'reset',
	name: string,
	reason: string | null,
	pressed: boolean | undefined,
	onclick: () => void,
	describedBy: string | null
)}
	{@const reasonId = `${id}-${kind}-reason`}
	<Tooltip.Root disabled={!reason}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant={pressed ? 'secondary' : 'outline'}
					size="sm"
					class={reason ? unavailableControl : undefined}
					aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}
					aria-disabled={reason ? 'true' : undefined}
					aria-describedby={[describedBy, reason ? reasonId : null].filter(Boolean).join(' ') ||
						undefined}
					data-unavailable={reason ? '' : undefined}
					data-tailor-preset={kind}
					{disabled}
					{onclick}
				>
					{#if pressed === undefined}
						<RotateCcwIcon class="size-4" />
					{:else if pressed}
						<CheckIcon class="size-4" />
					{:else}
						<EyeIcon class="size-4" />
					{/if}
					{name}
					{#if reason}
						<span id={reasonId} class="sr-only">{reason}</span>
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			<span data-unavailable-reason>{reason}</span>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<!-- indented to the workspace's name, so the glyph's column stays the row's. -->
<Collapsible.Root bind:open class="flex flex-col ps-6" data-tailor={id}>
	<Collapsible.Trigger
		class="flex min-h-7 w-full items-center gap-2 rounded-xl text-start text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
		data-tailor-fold
	>
		<span class="min-w-0 flex-1 first-letter:uppercase">
			{$LL.organization.workspaceSwitches.tailor()}
		</span>
		{#if custom}
			<span class="flex shrink-0 items-center gap-1.5 text-xs" data-tailor-custom>
				<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
				{$LL.organization.switches.custom()}
			</span>
		{/if}
		<ChevronDownIcon
			class="size-4 shrink-0 transition-transform duration-quick ease-move {open
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</Collapsible.Trigger>

	<Collapsible.Content>
		<!-- drawn only while open, so what nobody opened reaches neither a reader nor a screen
		     reader. -->
		{#if open}
			<div class="flex flex-col gap-3 pt-2 pb-1" data-tailor-open={id}>
				<p class="text-xs leading-snug text-muted-foreground" data-tailor-says>
					{$LL.organization.workspaceSwitches.tailorSays()}
				</p>

				<div class="flex flex-wrap items-center gap-2" data-tailor-presets>
					<span id={`${id}-read-only-says`} class="sr-only">
						{$LL.organization.workspaceSwitches.readOnlySays()}
					</span>
					<!-- pressed, it holds already, so a press changes nothing. -->
					{@render preset(
						'read-only',
						$LL.organization.workspaceSwitches.readOnly(),
						readOnly ? null : readOnlyRefused,
						readOnly,
						readOnly ? () => {} : press(readOnlyRefused, () => readOnlyTailoring(held, value)),
						`${id}-read-only-says`
					)}
					{#if custom}
						{@render preset(
							'reset',
							$LL.organization.workspaceSwitches.reset(),
							resetRefused,
							undefined,
							press(resetRefused, () => resetTailoring(organizationWide, held)),
							null
						)}
					{/if}
				</div>

				<PermissionSwitches
					{id}
					mask={shown}
					onChange={(next) => onChange(planOf(next))}
					held={readerPermissions}
					{refusal}
					refusalOf={(next) => refusalOfPlan(planOf(next))}
					{disabled}
					marked={{
						mask: recordsOf(value.pinned),
						label: $LL.organization.workspaceSwitches.pinned()
					}}
					records
				/>
			</div>
		{/if}
	</Collapsible.Content>
</Collapsible.Root>
