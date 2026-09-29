<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Switch } from '@rentable/design/primitive/switch/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { ADMINISTRATION_GLYPH, KIND_GLYPH, flagGlyph } from '$lib/organization/glyph';
	import {
		RECORD_KINDS,
		carriedIn,
		familyName,
		flagName,
		flagPhrase,
		flagSays,
		switchedTo,
		viewOf,
		writesOf
	} from '$lib/organization/role/role';
	import { FAMILIES, permits, type Family, type Flag } from '@rentable/workspace-permission';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import LockIcon from '@lucide/svelte/icons/lock';

	/**
	 * What a role carries, or what a member ends up with, as one list of switches (effort 838,
	 * requirement 12 as amended 2026-09-27, and a fourth time 2026-09-28). The role editor, a
	 * member's card and a workspace's permissions on that card all draw it.
	 *
	 * **Every group folds** (the human's call on the running application: "a list of groups and
	 * below them list of permissions with icons and descriptions"). Each kind of record, and the
	 * organization, is a head: its glyph, its name, how many of its permissions are on ("2 of 4",
	 * `carriedIn`) and a chevron, and a press opens it. That is the Human Interface Guidelines'
	 * disclosure (*Disclosure controls*): the whole of what a role can do reads as six lines, and a
	 * reader opens the one they came to change. A group is a quiet ring, so the groups are set apart
	 * by their space rather than by lines between rows. *Until the fourth amendment a kind's view
	 * was its head's switch, with add, edit and delete beneath it while view was on, and only the
	 * organization's ten folded.*
	 *
	 * **Opened, a group is one row per permission**: the permission's own glyph
	 * (`organization/glyph.ts`, `flagGlyph`: the eye, the plus, the pen and the bin the
	 * application's acts carry, and one for each of the organization's), its name, one line of what
	 * it allows (`flagSays`), and its switch. The line is the switch's description as well, so a
	 * screen reader hears it with the name.
	 *
	 * **Adding, editing and deleting need viewing.** Turning a kind's view off turns its writes off
	 * with it (`switchedTo`), and while view is off a write is refused, saying so, rather than
	 * hidden: the row stays where the reader expects it. *A mask stored before view was needed can
	 * carry a write without its view; that write's switch still turns off.*
	 *
	 * **The owner's own acts are no switch at all**: no role and no override can carry one, so they
	 * are one quiet line with the owner's crown ([[rules/interface]], *Guidance*: an act that does
	 * not apply is not offered).
	 *
	 * **A switch the reader may not turn is dimmed, and says why on hover and focus**, the way an
	 * act that cannot run does (`unavailableControl`): marked `aria-disabled` rather than
	 * disabled, so the reason stays reachable, and refusing the press. One sentence at the top
	 * says why when any is, in place of a line under every row, and it is the sentence a switch
	 * dimmed for the same reason says: the whole list's refusal, or `switches.notHeld`. A folded
	 * group with such a switch inside carries a lock on its head; the view's own refusal of a write
	 * does not, since it is the reader's to lift.
	 *
	 * **Compared against a baseline, a switch that differs is marked with a dot**, whose label
	 * names what it differs from, and a group with such a switch inside carries the dot on its
	 * head. The dot is a shape as well as a colour. The role editor compares against nothing. A
	 * caller may mark a set of flags instead, with its own words (`marked`).
	 *
	 * **Nothing is written from here.** It hands the mask its switches come to up through
	 * `onChange`, and the surface's own save writes it.
	 *
	 * **A workspace draws the record groups alone** (`records`; effort 838, requirement 12 as
	 * amended a third time): what is set for a member in one workspace is record flags and
	 * nothing else, so the organization's ten and the owner's line are not drawn there. Inside the
	 * workspace's own ring its groups are set apart by space alone, so no ring sits inside another.
	 */
	let {
		id,
		mask,
		onChange,
		held,
		refusal = null,
		refusalOf = () => null,
		disabled,
		baseline = null,
		marked = null,
		records = false
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
		/**
		 * what the switches are compared against, where they differ from it: a role, named by
		 * `name` in each difference's label.
		 */
		baseline?: { mask: number; name: string } | null;
		/**
		 * the flags to mark in place of the differences from `baseline`, and what each mark's label
		 * says: what differs in one workspace from the rest of the organization.
		 */
		marked?: { mask: number; label: string } | null;
		/** whether to draw the record groups alone, as a workspace sets them. */
		records?: boolean;
	} = $props();

	/** each group the list folds into: a kind of record, or the organization's ten. */
	type Group = { family: Family; glyph: typeof ADMINISTRATION_GLYPH; flags: readonly Flag[] };

	const groups = $derived<Group[]>([
		...RECORD_KINDS.map((kind) => ({
			family: kind,
			glyph: KIND_GLYPH[kind],
			flags: FAMILIES[kind]
		})),
		...(records
			? []
			: [
					{
						family: 'administration' as const,
						glyph: ADMINISTRATION_GLYPH,
						flags: FAMILIES.administration
					}
				])
	]);

	/** which groups are open: every one starts folded. */
	let opened = $state<Partial<Record<Family, boolean>>>({});

	/** every flag a switch is drawn for, whether or not its group is open. */
	const offered = $derived(groups.flatMap((group) => group.flags));

	const isOn = (flag: Flag) => permits(mask, flag);

	const differs = (flag: Flag) =>
		marked !== null
			? permits(marked.mask, flag)
			: baseline !== null && permits(baseline.mask, flag) !== permits(mask, flag);

	/** what a mark says: the caller's words, or the role the switch differs from. */
	const markLabel = $derived(
		marked?.label ?? (baseline ? $LL.organization.switches.differs({ role: baseline.name }) : '')
	);

	/** why the reader may not turn this switch: the whole list, or a flag they do not hold. */
	const heldReason = (flag: Flag): string | null => {
		if (refusal) return refusal;

		if (!permits(held, flag)) return $LL.organization.switches.notHeld();

		// turning a view off turns its writes off too, and each of those is the reader's to turn.
		const kind = RECORD_KINDS.find((each) => viewOf(each) === flag);

		if (kind && isOn(flag) && writesOf(kind).some((write) => isOn(write) && !permits(held, write)))
			return $LL.organization.switches.writesNotHeld();

		return null;
	};

	/** whether this is a write turned on while its kind's view is off, which writing needs. */
	const blind = (flag: Flag): boolean => {
		const kind = RECORD_KINDS.find((each) => writesOf(each).includes(flag));

		return kind !== undefined && !isOn(flag) && !isOn(viewOf(kind));
	};

	/** why the mask this switch would turn the list to is refused, or `null`. */
	const nextReason = (flag: Flag) => refusalOf(switchedTo(mask, flag, !isOn(flag)));

	/** why this switch will not turn, or `null` where it will. */
	const reasonOf = (flag: Flag): string | null =>
		heldReason(flag) ?? (blind(flag) ? $LL.organization.switches.viewFirst() : nextReason(flag));

	/** whether a switch is refused for a reason that is not the reader's to lift here. */
	const refusedToReader = (flag: Flag) =>
		heldReason(flag) !== null || (!blind(flag) && nextReason(flag) !== null);

	const anyRefused = $derived(refusal !== null || offered.some((flag) => !permits(held, flag)));

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
</script>

{#snippet mark(flag: Flag)}
	{#if differs(flag)}
		<span
			id={`${id}-${flag}-differs`}
			role="img"
			aria-label={markLabel}
			class="size-2 shrink-0 rounded-full bg-primary"
			data-differs={flag}
		></span>
	{/if}
{/snippet}

{#snippet toggle(flag: Flag)}
	{@const reason = reasonOf(flag)}
	<Tooltip.Root disabled={!reason}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Switch
					{...props}
					id={`${id}-${flag}`}
					checked={isOn(flag)}
					onCheckedChange={(on) => turn(flag, on)}
					onclick={refuse(flag)}
					onkeydown={refuseKey(flag)}
					{disabled}
					aria-label={flagPhrase($LL, flag)}
					aria-disabled={reason ? 'true' : undefined}
					aria-describedby={[
						`${id}-${flag}-says`,
						reason ? `${id}-${flag}-reason` : null,
						differs(flag) ? `${id}-${flag}-differs` : null
					]
						.filter(Boolean)
						.join(' ')}
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

<div class="flex flex-col gap-2" data-switches={id}>
	<!-- why a switch is dimmed, once, above them all: the whole list, or the ones the reader does
	     not hold. A switch dimmed for either reason says the same sentence in its tooltip; one
	     dimmed for a reason of its own says that, and only there. -->
	{#if anyRefused}
		<Field.Description data-switches-refusal>
			{refusal ?? $LL.organization.switches.notHeld()}
		</Field.Description>
	{/if}

	{#each groups as group (group.family)}
		{@const Glyph = group.glyph}
		{@const open = opened[group.family] ?? false}
		<Collapsible.Root
			{open}
			onOpenChange={(next) => {
				opened[group.family] = next;
			}}
			class={records
				? 'flex flex-col gap-1'
				: 'flex flex-col gap-1 rounded-2xl px-3 py-2 ring-1 ring-foreground/5'}
			data-switches-group={group.family}
		>
			<Collapsible.Trigger
				class="flex min-h-8 w-full items-center gap-2 rounded-xl text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				data-switches-fold={group.family}
			>
				<Glyph class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span class="min-w-0 flex-1 text-sm font-medium first-letter:uppercase">
					{familyName($LL, group.family)}
				</span>
				<!-- what the group holds inside, said on its head while it is folded: a difference, and
				     a switch that is not the reader's to turn. -->
				{#if group.flags.some(differs)}
					<span
						role="img"
						aria-label={markLabel}
						class="size-2 shrink-0 rounded-full bg-primary"
						data-differs={group.family}
					></span>
				{/if}
				{#if group.flags.some(refusedToReader)}
					<span
						role="img"
						aria-label={$LL.organization.switches.groupRefused()}
						class="flex shrink-0 text-muted-foreground"
						data-switches-refused={group.family}
					>
						<LockIcon class="size-3.5" aria-hidden="true" />
					</span>
				{/if}
				<span
					class="text-xs text-muted-foreground tabular-nums"
					data-switches-summary={group.family}
				>
					{$LL.organization.switches.folded({
						count: carriedIn(mask, group.family).length,
						total: group.flags.length
					})}
				</span>
				<ChevronDownIcon
					class="size-4 shrink-0 text-muted-foreground transition-transform duration-quick ease-move {open
						? 'rotate-180'
						: ''}"
					aria-hidden="true"
				/>
			</Collapsible.Trigger>

			<Collapsible.Content>
				<!-- drawn only while open, so what nobody opened reaches neither a reader nor a screen
				     reader. Indented to the group's name, so the glyph's column stays the head's. -->
				{#if open}
					<div class="flex flex-col gap-1 ps-6 pt-1" data-switches-rows={group.family}>
						{#each group.flags as flag (flag)}
							{@const FlagGlyph = flagGlyph(flag)}
							<div class="flex min-h-10 items-center gap-2 py-0.5" data-switch-row={flag}>
								<FlagGlyph class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<div class="flex min-w-0 flex-1 flex-col">
									<Field.Label
										for={`${id}-${flag}`}
										class="block font-normal first-letter:uppercase"
									>
										{flagName($LL, flag)}
									</Field.Label>
									<span
										id={`${id}-${flag}-says`}
										class="text-xs leading-snug text-muted-foreground"
										data-switch-says={flag}
									>
										{flagSays($LL, flag)}
									</span>
								</div>
								{@render mark(flag)}
								{@render toggle(flag)}
							</div>
						{/each}
					</div>
				{/if}
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}

	<!-- the owner's own acts, which no role and no override carries: said, not offered. A workspace
	     sets record flags alone, so it does not draw the line. -->
	{#if !records}
		<p class="flex items-center gap-2 px-3 text-xs text-muted-foreground" data-switches-owner>
			<CrownIcon class="size-3.5 shrink-0" aria-hidden="true" />
			<span>{$LL.organization.switches.owner()}</span>
		</p>
	{/if}
</div>
