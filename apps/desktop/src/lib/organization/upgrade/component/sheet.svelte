<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Item from '@rentable/design/primitive/item/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { onSubmit } from '$lib/form';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import type { UpgradeMachine, UpgradePreview, UpgradeTarget } from '$lib/organization/host';
	import { formatLocaleDate } from '$lib/platform/locale';
	import CheckIcon from '@lucide/svelte/icons/check';
	import DatabaseArrowUpIcon from '@lucide/svelte/icons/database-arrow-up';
	import LaptopIcon from '@lucide/svelte/icons/laptop';

	/**
	 * The upgrade of the organization or of one workspace, seen before it runs (effort 857,
	 * requirement 3, ticket 08).
	 *
	 * **The edge panel**, the form surface at its heavy weight ([[contexts/desktop/components]]):
	 * a write that reaches everybody's machines and asks the reader to look before choosing, read
	 * from the top. What the upgrade changes stands first, one sentence a step, under the line that
	 * says it runs once for everyone with a copy kept; then whom it reaches, each machine a row of
	 * its member, its own name and the rentable it runs, in three lists: those seen in the last
	 * seven days it would stop, those it would make read-only, and, under a heading of their own,
	 * those it would reach that were not seen in that window, each with the day it last was. A
	 * list with nobody in it is not drawn; with nobody at all, one line says nobody seen lately is
	 * affected, so the reader is not left reading an absence.
	 *
	 * **Two choices, in the footer**: not yet, which closes the sheet and changes nothing, and
	 * upgrade now, the primary, with the upgrade's own glyph. Upgrade now waits while who it
	 * affects is still being found and while it runs, and where the reader may not run it (a step
	 * needing the owner's key, the owner not having opened this version) it stays in its place,
	 * refused, and says why at the control ([[rules/interface]], *An act that cannot run says why
	 * at the control*).
	 *
	 * **The run is the caller's** (`./host.svelte`): this hands it up through `onUpgrade`.
	 */
	let {
		open,
		onOpenChange,
		target,
		name,
		preview,
		refusal,
		running,
		onUpgrade
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what is upgraded. */
		target: UpgradeTarget;
		/** the workspace's name, which the title says; unread for the organization. */
		name: string;
		/** what the upgrade would do, or `undefined` while it is being found. */
		preview: UpgradePreview | undefined;
		/** why the reader may not run it, or `null` where they may. */
		refusal: string | null;
		/** whether the run is under way. */
		running: boolean;
		onUpgrade: () => void;
	} = $props();

	const waits = $derived(preview === undefined || running || refusal !== null);

	const enhance = onSubmit(() => {
		if (waits) return;

		onUpgrade();
	});

	const lists = $derived(
		preview
			? (
					[
						['stopped', $LL.organization.upgrade.stopped(), preview.stopped],
						['readOnly', $LL.organization.upgrade.readOnly(), preview.readOnly],
						['unseen', $LL.organization.upgrade.unseen(), preview.unseen]
					] as const
				).filter(([, , machines]) => machines.length > 0)
			: []
	);

	/**
	 * what a step adds or changes, by the key Rust declares it with (`database/step.rs`), each of
	 * which has its sentence in both locales.
	 */
	const describe = (key: string) =>
		$LL.organization.upgrade.steps[key as keyof typeof $LL.organization.upgrade.steps]();

	const dateOf = (moment: number) => formatLocaleDate($locale, moment, { dateStyle: 'medium' });

	const reasonId = $props.id();
</script>

{#snippet machine(row: UpgradeMachine, seen: boolean)}
	<Item.Root size="sm" class="px-0 py-2" data-upgrade-machine>
		<Item.Media class="text-muted-foreground">
			<LaptopIcon class="size-4" aria-hidden="true" />
		</Item.Media>
		<Item.Content class="min-w-0">
			<Item.Title class="min-w-0">
				<span data-machine-member class="truncate">
					{#if row.member}<bdi>{row.member}</bdi
						>{:else}{$LL.organization.upgrade.nobodySignedIn()}{/if}
				</span>
			</Item.Title>
			<Item.Description class="flex flex-wrap gap-x-2">
				<span data-machine-name>
					{#if row.name}<bdi>{row.name}</bdi>{:else}{$LL.organization.upgrade.unnamedMachine()}{/if}
				</span>
				<span aria-hidden="true">·</span>
				<!-- a version is a machine's string, read left to right in either language; the stand-in
				     for one never said is the reader's words and takes their direction. -->
				<span data-machine-version dir={row.rentable ? 'ltr' : undefined}>
					{row.rentable
						? $LL.organization.upgrade.version({ version: row.rentable })
						: $LL.organization.upgrade.unknownVersion()}
				</span>
				{#if seen}
					<span aria-hidden="true">·</span>
					<span data-machine-seen>
						{$LL.organization.upgrade.lastSeen({ date: dateOf(row.seenAt) })}
					</span>
				{/if}
			</Item.Description>
		</Item.Content>
	</Item.Root>
{/snippet}

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={target === 'organization'
		? $LL.organization.upgrade.titleOrganization()
		: $LL.organization.upgrade.titleWorkspace({ workspace: name })}
	description={$LL.organization.upgrade.description()}
>
	<div class="flex flex-col gap-6" data-upgrade-sheet>
		<!-- what it changes, first: the reason anybody would choose it. -->
		<section class="flex flex-col gap-3" aria-labelledby="{reasonId}-changes">
			<h3 id="{reasonId}-changes" class="text-sm font-medium first-letter:uppercase">
				{$LL.organization.upgrade.changes()}
			</h3>
			{#if preview}
				<ul class="flex flex-col gap-2" data-upgrade-steps>
					{#each preview.steps as step, index (index)}
						<li class="flex items-start gap-2 text-sm">
							<CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
							<span>{describe(step.describes)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground" data-upgrade-finding>
					{$LL.organization.upgrade.finding()}
				</p>
			{/if}
		</section>

		<!-- then whom it reaches, each list under its own heading. -->
		{#if preview && lists.length === 0}
			<p class="text-sm text-muted-foreground" data-upgrade-nobody>
				{$LL.organization.upgrade.nobodyAffected()}
			</p>
		{/if}

		{#each lists as [kind, heading, machines] (kind)}
			<section
				class="flex flex-col gap-1"
				aria-labelledby="{reasonId}-{kind}"
				data-upgrade-list={kind}
			>
				<h3 id="{reasonId}-{kind}" class="text-sm font-medium first-letter:uppercase">
					{heading}
				</h3>
				<Item.Group>
					{#each machines as row, index (index)}
						{@render machine(row, kind === 'unseen')}
					{/each}
				</Item.Group>
			</section>
		{/each}
	</div>

	{#snippet actions({ requestClose })}
		<Button
			type="button"
			variant="outline"
			disabled={running}
			onclick={requestClose}
			data-upgrade-not-yet
		>
			{$LL.organization.upgrade.notYet()}
		</Button>
		<Tooltip.Root disabled={refusal === null}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<!-- never the platform's disabled: a refused control keeps the keyboard and the pointer,
					     and its reason is its description. -->
					<Button
						{...props}
						type="submit"
						class={waits ? unavailableControl : ''}
						aria-disabled={waits ? 'true' : undefined}
						aria-busy={running ? 'true' : undefined}
						aria-describedby={refusal ? `${reasonId}-refusal` : undefined}
						data-upgrade-now
					>
						<DatabaseArrowUpIcon class="size-4" />
						{running ? $LL.common.actions.working() : $LL.organization.upgrade.now()}
						{#if refusal}
							<span id="{reasonId}-refusal" class="sr-only">{refusal}</span>
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				<span data-unavailable-reason>{refusal}</span>
			</Tooltip.Content>
		</Tooltip.Root>
	{/snippet}
</FormSurface>
