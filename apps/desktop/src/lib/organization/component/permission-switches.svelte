<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Switch } from '@rentable/design/primitive/switch/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { ADMINISTRATION_GLYPH, KIND_GLYPH } from '$lib/organization/glyph';
	import {
		ADMINISTRATION_TOTAL,
		EDITABLE_FAMILIES,
		RECORD_KINDS,
		administrationHeld,
		familyName,
		flagName,
		switchedTo,
		viewOf,
		writesOf,
		type RecordKind
	} from '$lib/organization/role';
	import { FAMILIES, permits, type Flag } from '@rentable/workspace-permission';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CrownIcon from '@lucide/svelte/icons/crown';

	/**
	 * What a role carries, or what a member ends up with, as one list of switches (effort 838,
	 * requirement 12 as amended 2026-09-27). The role editor and a member's card both draw it.
	 *
	 * **A kind of record is a group, headed by its glyph and its name, and its view is the group's
	 * switch.** Add, edit and delete are mini switches beneath it, drawn while view is on, and
	 * turning view off turns them off with it (`switchedTo`): writing a record needs seeing it.
	 * That is the Human Interface Guidelines' primary switch with mini switches for what hangs off
	 * it (*Toggles*), and it keeps a role that sees little down to a handful of rows. A group is
	 * the workspaces list's record, a quiet ring, so the groups are set apart by their space rather
	 * than by lines between rows. *A mask stored before view was needed can carry a write without
	 * its view; its switches stay drawn while any is on, so nothing live is out of sight.*
	 *
	 * **The glyphs are the ones each kind already has** (`organization/glyph.ts`), which a role's
	 * card draws too ([[rules/frontend]]: a concept keeps one glyph everywhere it appears).
	 *
	 * **The organization's ten fold to a count** ("4 of 10", `administrationHeld`, which a role's
	 * card counts with too) behind one disclosure, since most roles hold few of them and a reader
	 * opens them to change them. The owner's own acts are no switch at all: no role and no
	 * override can carry one, so they are one quiet line with the owner's crown
	 * ([[rules/interface]], *Guidance*: an act that does not apply is not offered).
	 *
	 * **A switch the reader may not turn is dimmed, and says why on hover and focus**, the way an
	 * act that cannot run does (`unavailableControl`): marked `aria-disabled` rather than
	 * disabled, so the reason stays reachable, and refusing the press. One sentence at the top
	 * says why when any is, in place of a line under every row.
	 *
	 * **Compared against a role, a switch that differs is marked with a dot**, whose label names
	 * the role, and a folded group with such a switch inside carries the dot on its head. The dot
	 * is a shape as well as a colour. The role editor compares against nothing.
	 *
	 * **Nothing is written from here.** It hands the mask its switches come to up through
	 * `onChange`, and the surface's own save writes it.
	 */
	let {
		id,
		mask,
		onChange,
		held,
		refusal = null,
		refusalOf = () => null,
		disabled,
		baseline = null
	}: {
		/** what each switch is named by in the document: `<id>-<flag>`. */
		id: string;
		/** what the switches show. */
		mask: number;
		onChange: (mask: number) => void;
		/** what the reader may do: a flag outside it is not theirs to turn. */
		held: number;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		/**
		 * why the mask a switch would turn the list to is refused for a reason beyond the reader's
		 * flags, or `null` where it is not: the role editor's holders (ticket 45 of effort 838).
		 */
		refusalOf?: (next: number) => string | null;
		/** whether the surface is saving, when nothing is turned. */
		disabled: boolean;
		/** the role the switches are compared against, where they differ from it. */
		baseline?: { mask: number; name: string } | null;
	} = $props();

	const VERBS = { 1: 'add', 2: 'edit', 3: 'delete' } as const;

	const ADMINISTRATION = FAMILIES.administration as readonly Flag[];

	let administrationOpen = $state(false);

	/** every flag a switch is drawn for, whether or not it is on screen. */
	const offered = EDITABLE_FAMILIES.flatMap((family) => FAMILIES[family] as readonly Flag[]);

	const isOn = (flag: Flag) => permits(mask, flag);

	const differs = (flag: Flag) =>
		baseline !== null && permits(baseline.mask, flag) !== permits(mask, flag);

	/** why this switch will not turn, or `null` where it will. */
	const reasonOf = (flag: Flag): string | null => {
		if (refusal) return refusal;

		if (!permits(held, flag)) return $LL.organization.dashboard.notHeld();

		// turning a view off turns its writes off too, and each of those is the reader's to turn.
		const kind = RECORD_KINDS.find((each) => viewOf(each) === flag);

		if (kind && isOn(flag) && writesOf(kind).some((write) => isOn(write) && !permits(held, write)))
			return $LL.organization.switches.writesNotHeld();

		return refusalOf(switchedTo(mask, flag, !isOn(flag)));
	};

	const anyRefused = $derived(refusal !== null || offered.some((flag) => !permits(held, flag)));

	/** the switch's whole name, since a group's head is not part of it: `add contracts`. */
	const phraseOf = (kind: RecordKind, index: number) => {
		const verb = index === 0 ? 'view' : VERBS[index as 1 | 2 | 3];

		return `${$LL.organization.switches[verb]()} ${familyName($LL, kind)}`;
	};

	const turn = (flag: Flag, on: boolean) => {
		if (disabled || reasonOf(flag) !== null) return;

		onChange(switchedTo(mask, flag, on));
	};

	/** a press on a switch that will not turn is answered by its reason, and goes no further. */
	const refuse = (flag: Flag) => (event: Event) => {
		if (reasonOf(flag) !== null) event.preventDefault();
	};

	const refuseKey = (flag: Flag) => (event: KeyboardEvent) => {
		if ((event.key === 'Enter' || event.key === ' ') && reasonOf(flag) !== null) {
			event.preventDefault();
		}
	};

	const administrationOn = $derived(administrationHeld(mask));
</script>

{#snippet mark(flag: Flag)}
	{#if baseline && differs(flag)}
		<span
			id={`${id}-${flag}-differs`}
			role="img"
			aria-label={$LL.organization.switches.differs({ role: baseline.name })}
			class="size-2 shrink-0 rounded-full bg-primary"
			data-differs={flag}
		></span>
	{/if}
{/snippet}

{#snippet toggle(flag: Flag, name: string, size: 'default' | 'sm')}
	{@const reason = reasonOf(flag)}
	<Tooltip.Root disabled={!reason}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Switch
					{...props}
					id={`${id}-${flag}`}
					{size}
					checked={isOn(flag)}
					onCheckedChange={(on) => turn(flag, on)}
					onclick={refuse(flag)}
					onkeydown={refuseKey(flag)}
					{disabled}
					aria-label={name}
					aria-disabled={reason ? 'true' : undefined}
					aria-describedby={[
						reason ? `${id}-${flag}-reason` : null,
						baseline && differs(flag) ? `${id}-${flag}-differs` : null
					]
						.filter(Boolean)
						.join(' ') || undefined}
					class={reason ? unavailableControl : undefined}
					data-switch={flag}
					data-unavailable={reason ? '' : undefined}
				/>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			<span data-unavailable-reason>{reason}</span>
		</Tooltip.Content>
	</Tooltip.Root>
	{#if reason}
		<span id={`${id}-${flag}-reason`} class="sr-only">{reason}</span>
	{/if}
{/snippet}

<div class="flex flex-col gap-3" data-switches={id}>
	<!-- why a switch is dimmed, once, above them all: the whole list, or the ones the reader does
	     not hold. The same line is in each dimmed switch's tooltip. -->
	{#if anyRefused}
		<Field.Description data-switches-refusal>
			{refusal ?? $LL.organization.switches.notHeld()}
		</Field.Description>
	{/if}

	{#each RECORD_KINDS as kind (kind)}
		{@const Glyph = KIND_GLYPH[kind]}
		{@const view = viewOf(kind)}
		{@const writes = writesOf(kind)}
		<div
			class="flex flex-col gap-1 rounded-2xl px-3 py-2 ring-1 ring-foreground/5"
			data-switches-group={kind}
		>
			<div class="flex min-h-8 items-center gap-2">
				<Glyph class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<label for={`${id}-${view}`} class="min-w-0 flex-1 text-sm font-medium">
					{familyName($LL, kind)}
				</label>
				{@render mark(view)}
				{@render toggle(view, phraseOf(kind, 0), 'default')}
			</div>

			<!-- beneath the view, and only while it is on: what the reader can do with what they see.
			     Indented to the name, so the glyph's column stays the group's. -->
			{#if isOn(view) || writes.some(isOn)}
				<div class="flex flex-col gap-1 ps-6" data-switches-writes={kind}>
					{#each writes as flag, index (flag)}
						<div class="flex min-h-7 items-center gap-2">
							<div class="flex min-w-0 flex-1 flex-col">
								<label for={`${id}-${flag}`} class="text-sm">
									{$LL.organization.switches[VERBS[(index + 1) as 1 | 2 | 3]]()}
								</label>
								{#if flag === 'editContract'}
									<span class="text-xs text-muted-foreground" data-switch-says={flag}>
										{$LL.organization.switches.contractEdit()}
									</span>
								{/if}
							</div>
							{@render mark(flag)}
							{@render toggle(flag, phraseOf(kind, index + 1), 'sm')}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	<!-- the organization's ten, folded to how many are on: opened to be changed. -->
	<Collapsible.Root
		bind:open={administrationOpen}
		class="flex flex-col gap-1 rounded-2xl px-3 py-2 ring-1 ring-foreground/5"
		data-switches-group="administration"
	>
		<Collapsible.Trigger
			class="flex min-h-8 w-full items-center gap-2 rounded-xl text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
			data-switches-fold
		>
			<ADMINISTRATION_GLYPH class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="min-w-0 flex-1 text-sm font-medium">
				{familyName($LL, 'administration')}
			</span>
			{#if baseline && ADMINISTRATION.some(differs)}
				<span
					role="img"
					aria-label={$LL.organization.switches.differs({ role: baseline.name })}
					class="size-2 shrink-0 rounded-full bg-primary"
					data-differs="administration"
				></span>
			{/if}
			<span class="text-xs text-muted-foreground tabular-nums" data-switches-summary>
				{$LL.organization.switches.folded({
					count: administrationOn,
					total: ADMINISTRATION_TOTAL
				})}
			</span>
			<ChevronDownIcon
				class="size-4 shrink-0 text-muted-foreground transition-transform duration-quick ease-move {administrationOpen
					? 'rotate-180'
					: ''}"
				aria-hidden="true"
			/>
		</Collapsible.Trigger>

		<Collapsible.Content>
			<!-- drawn only while open, so what nobody opened reaches neither a reader nor a screen
			     reader. -->
			{#if administrationOpen}
				<div class="flex flex-col gap-1 ps-6 pt-1" data-switches-writes="administration">
					{#each ADMINISTRATION as flag (flag)}
						<div class="flex min-h-7 items-center gap-2">
							<label for={`${id}-${flag}`} class="min-w-0 flex-1 text-sm">
								{flagName($LL, flag)}
							</label>
							{@render mark(flag)}
							{@render toggle(flag, flagName($LL, flag), 'sm')}
						</div>
					{/each}
				</div>
			{/if}
		</Collapsible.Content>
	</Collapsible.Root>

	<!-- the owner's own acts, which no role and no override carries: said, not offered. -->
	<p class="flex items-center gap-2 px-3 text-xs text-muted-foreground" data-switches-owner>
		<CrownIcon class="size-3.5 shrink-0" aria-hidden="true" />
		<span>{$LL.organization.switches.owner()}</span>
	</p>
</div>
