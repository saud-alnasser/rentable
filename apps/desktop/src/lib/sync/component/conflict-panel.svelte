<script lang="ts">
	import { Badge } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { cn } from '$lib/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import type { GoogleDriveLinkConflict } from '$lib/platform/tauri';
	import { getConflictPresentation } from '$lib/sync/conflict';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { tv } from 'tailwind-variants';

	/**
	 * The question a diverged workspace raises, and its answers.
	 *
	 * It leads with the question because that is what the reader was stopped for — at startup
	 * they are trying to open the application, not audit it. Under it the two copies are the
	 * choice rather than a description of one: a copy is selected, and a single control acts on
	 * the selection. What lies behind the choice — when each side was last written, which is
	 * newer, what the remote copy is called — is stated on the copy it belongs to, because the
	 * choice is irreversible and its evidence cannot be hover-only.
	 *
	 * One control acts, in the corner of the question. It is the only thing this panel offers —
	 * leaving the question unanswered belongs to the screen that raised it, so the way past a
	 * conflict is the host card's corner rather than this one's.
	 *
	 * @see ConflictDismiss for that way past
	 */
	let {
		conflict,
		isWorking,
		onKeepLocal,
		onUseRemote,
		onRelink,
		class: className
	}: {
		conflict: GoogleDriveLinkConflict;
		/** whether an answer is being carried out. Which one is this panel's own to remember. */
		isWorking: boolean;
		onKeepLocal: () => void;
		onUseRemote: () => void;
		onRelink?: () => void;
		class?: string;
	} = $props();

	// one table keyed by kind, shared with every other screen that can raise a conflict, so the
	// same conflict reads identically wherever it is raised.
	const presentation = $derived(getConflictPresentation(conflict, $LL));

	// the table says so: a kind offering no remote copy declares no label for taking one — and
	// with only one copy to keep there is nothing to select between.
	const isChoice = $derived(presentation.useRemoteLabel !== undefined);

	// the local copy, which is what the primary control did before the copies became selectable:
	// pressing it without touching anything still keeps the reader's own work.
	let selected = $state<'local' | 'remote'>('local');
	const keptCopy = $derived(isChoice ? selected : 'local');

	// whether this panel's control is the one carrying out the work, rather than the host's: the
	// control that was pressed is the one that says so. It forgets once the work is over.
	let pressed = $state<'keep' | null>(null);

	$effect(() => {
		if (!isWorking) {
			pressed = null;
		}
	});

	// the group is named by the question above it rather than by a label of its own: the question
	// is what the copies are being chosen against.
	const questionId = $props.id();

	// what the acting control says, in the words the presentation table already declares — the two
	// long labels it replaced were one per side, and the side is now the selection's to state.
	const keepLabel = $derived(
		keptCopy === 'remote' && presentation.useRemoteLabel
			? presentation.useRemoteLabel
			: presentation.keepLocalLabel
	);

	function keepSelectedCopy() {
		pressed = 'keep';

		if (keptCopy === 'remote') {
			onUseRemote();
			return;
		}

		if (conflict.kind === 'relink') {
			onRelink?.();
			return;
		}

		onKeepLocal();
	}

	function formatTimestamp(value: number | null) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, { dateStyle: 'medium', timeStyle: 'short' });
	}

	const newerSide = $derived.by(() => {
		const local = conflict.localSnapshotAt ?? 0;
		const remote = conflict.remoteUpdatedAt ?? 0;

		if (local === remote) return null;

		return local > remote ? ('local' as const) : ('remote' as const);
	});

	const sides = $derived([
		{
			key: 'local' as const,
			icon: HardDriveIcon,
			name: $LL.settings.syncProviderLocal(),
			detail: [
				presentation.localDescription,
				$LL.settings.syncLastSnapshotDescription({
					value: formatTimestamp(conflict.localSnapshotAt)
				})
			]
		},
		{
			key: 'remote' as const,
			icon: CloudIcon,
			name: $LL.settings.syncProviderGoogleDrive(),
			detail: [
				presentation.remoteDescription,
				$LL.settings.syncLastRemoteDescription({
					value: formatTimestamp(conflict.remoteUpdatedAt)
				}),
				conflict.remoteFilename
			].filter((line): line is string => Boolean(line))
		}
	]);

	// a copy reads as a target only where it is one. Where the kind offers nothing to choose
	// between, the same two blocks carry the same evidence with no border and no affordance —
	// a card that cannot be pressed should not look like one.
	const copy = tv({
		base: 'flex w-full items-start gap-2 rounded-xl border border-transparent p-3 text-start',
		variants: {
			selectable: {
				true: 'cursor-pointer border-border transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
				false: 'bg-muted/40'
			},
			checked: {
				true: 'border-primary bg-primary/5',
				false: ''
			}
		}
	});
</script>

{#snippet marker(checked: boolean)}
	<span
		class={cn(
			'flex size-4 shrink-0 items-center justify-center rounded-full border',
			checked && 'border-primary'
		)}
		aria-hidden="true"
	>
		{#if checked}
			<span class="size-2 rounded-full bg-primary"></span>
		{/if}
	</span>
{/snippet}

{#snippet body(side: (typeof sides)[number])}
	{@const Icon = side.icon}
	<div class="min-w-0 space-y-1">
		<div class="flex items-center gap-1.5 text-sm font-medium">
			<Icon class="size-4 shrink-0" aria-hidden="true" />
			<span>{side.name}</span>
			<!-- which copy is newer is the one comparison a reader makes before choosing, so it is
			     a chip rather than another line of prose in the block below. -->
			{#if newerSide === side.key}
				<Badge variant="secondary">{$LL.settings.syncConflictLatestBadge()}</Badge>
			{/if}
		</div>
		<!-- stated rather than tucked into a tooltip: this is the evidence for a choice that
		     destroys one of the two copies. -->
		{#each side.detail as line (line)}
			<p class="text-xs break-all text-muted-foreground">{line}</p>
		{/each}
	</div>
{/snippet}

<div class={cn('space-y-4 rounded-2xl border bg-card p-4', className)}>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1 space-y-1">
			<p id={questionId} class="text-base font-semibold">{presentation.title}</p>
			<p class="text-sm text-muted-foreground">{presentation.description}</p>
		</div>

		<!-- the answer sits in the corner of the question it answers. Its glyph is a tick, because
		     what it confirms is the selection below it — which copy survives is the selection's to
		     say, and a second glyph saying it would let the two disagree. Its words are on its
		     accessible name and its tooltip.

		     Filled rather than outlined, because _Semantics are secondary_ (60) asks a primary action
		     to be obvious and an outlined glyph in a corner reads as decoration. Secondary rather
		     than the accent: the selected copy is already carrying the accent, and two primaries on
		     one small surface leave neither leading. -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-sm"
						disabled={isWorking}
						aria-label={keepLabel}
						onclick={keepSelectedCopy}
					>
						{#if pressed === 'keep'}
							<Spinner class="size-4" />
						{:else}
							<CheckIcon class="size-4" />
						{/if}
						<span class="sr-only">{keepLabel}</span>
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>{keepLabel}</Tooltip.Content>
		</Tooltip.Root>
	</div>

	{#if isChoice}
		<!-- a radio group whose items are the copies themselves, so the reader compares and
		     decides in one place instead of comparing here and acting further down (_Think outside
		     the box_ — a radio group may be selectable cards). -->
		<RadioGroupPrimitive.Root
			value={selected}
			onValueChange={(value) => {
				selected = value === 'remote' ? 'remote' : 'local';
			}}
			disabled={isWorking}
			aria-labelledby={questionId}
			class="grid gap-3 sm:grid-cols-2"
		>
			{#each sides as side (side.key)}
				<RadioGroupPrimitive.Item value={side.key}>
					{#snippet child({ props, checked })}
						<div {...props} class={copy({ selectable: true, checked })}>
							{@render marker(checked)}
							{@render body(side)}
						</div>
					{/snippet}
				</RadioGroupPrimitive.Item>
			{/each}
		</RadioGroupPrimitive.Root>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each sides as side (side.key)}
				<div class={copy({ selectable: false })}>
					{@render body(side)}
				</div>
			{/each}
		</div>
	{/if}
</div>
