<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tabs from '$lib/design/primitive/tabs';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BackControl from '$lib/design/block/back-control.svelte';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import ComplexesTableUnitsCount from '$lib/complex/component/unit-count.svelte';
	import { useDeleteComplex, useFetchComplex } from '$lib/complex/query';
	import { useFetchUnits } from '$lib/complex/query';
	import { isComplexDeletable } from '$lib/complex/complex';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ComplexForm from './form.svelte';
	import UnitDirectory from './unit-directory.svelte';

	type ComplexDetailsSection = 'overview' | 'units';

	let {
		complexId,
		initialSection = 'overview'
	}: {
		complexId: number;
		initialSection?: ComplexDetailsSection;
	} = $props();
	// eslint-disable-next-line svelte/prefer-writable-derived
	let activeSection = $state<ComplexDetailsSection>('overview');

	const complexQuery = useFetchComplex(() => complexId);
	const deleteMutation = useDeleteComplex();

	// what a deletion would be refused for, read before the question is asked rather than
	// after the destructive control is pressed.
	const heldUnitsQuery = useFetchUnits(() => complexId);
	const complexBlockers = $derived.by(() => {
		if (heldUnitsQuery.isPending) return undefined;

		const held = heldUnitsQuery.data ?? [];

		return isComplexDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedUnits({ count: held.length })];
	});
	const tabsListClass = 'grid h-auto w-full grid-cols-2';
	const tabsTriggerClass = 'capitalize';

	let formOpensOn = $state<Partial<NonNullable<typeof complexQuery.data>> | undefined>(undefined);
	let isComplexFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	async function deleteComplex() {
		if (!complexQuery.data) return;

		await deleteMutation.mutateAsync(complexQuery.data.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

		await goto(resolve('/complexes'));
	}

	const getSectionHref = (section: ComplexDetailsSection) =>
		resolve(`/complexes/${complexId}${section === 'overview' ? '' : `?section=${section}`}`);

	$effect(() => {
		activeSection = initialSection;
	});

	$effect(() => {
		if (activeSection === initialSection) {
			return;
		}

		void goto(getSectionHref(activeSection), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#if complexQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !complexQuery.data}
	<Card>
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const complex = complexQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div class="rounded-2xl border bg-muted p-4">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<BackControl fallback={resolve('/complexes')} />

				<div class="flex flex-wrap items-center justify-end gap-2">
					<RecordActions
						details={[
							{ label: $LL.common.labels.name(), value: complex.name },
							{ label: $LL.common.labels.location(), value: complex.location }
						]}
						onDuplicate={() => {
							// the name is a complex's unique field, so the copy starts without it
							// rather than with a value that cannot be saved.
							formOpensOn = { ...complex, id: undefined, name: '' };
							isComplexFormOpen = true;
						}}
					/>

					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.common.actions.edit()}
									class="rounded-full bg-secondary"
									onclick={() => {
										formOpensOn = complex;
										isComplexFormOpen = true;
									}}
								>
									<SquarePenIcon class="size-4" />
									<span class="sr-only">{$LL.common.actions.edit()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}>
							{$LL.common.actions.edit()}
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="destructive"
									size="icon-sm"
									aria-label={$LL.common.actions.delete()}
									class="rounded-full"
									onclick={() => (isDeleteDialogOpen = true)}
								>
									<Trash2Icon class="size-4" />
									<span class="sr-only">{$LL.common.actions.delete()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}>
							{$LL.common.actions.delete()}
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>

			<div class="mt-4 min-w-0 space-y-1 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.nav.complexes()}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{complex.name}</h1>
				<p class="text-sm text-muted-foreground">{complex.location}</p>
			</div>
		</div>

		<Tabs.Root bind:value={activeSection} class="min-h-0 flex-1 gap-3">
			<Tabs.List class={tabsListClass}>
				<Tabs.Trigger value="overview" class={tabsTriggerClass}>
					{$LL.common.labels.information()}
				</Tabs.Trigger>
				<Tabs.Trigger value="units" class={tabsTriggerClass}>
					{$LL.common.nav.units()}
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="overview" class="pb-1">
				<Card class="gap-0 overflow-hidden">
					<CardHeader class="gap-2 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3 py-4">
						<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.location()}
								</p>
								<p class="mt-3 text-sm font-medium">{complex.location}</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.units()}
								</p>
								<div class="mt-3 text-3xl leading-none font-semibold">
									<ComplexesTableUnitsCount complexId={complex.id} class="h-auto w-auto" />
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</Tabs.Content>

			<Tabs.Content value="units" class="flex min-h-0 flex-1 flex-col pt-1">
				<UnitDirectory {complexId} />
			</Tabs.Content>
		</Tabs.Root>
	</div>

	<ComplexForm
		open={isComplexFormOpen}
		onOpenChange={(isOpen) => {
			isComplexFormOpen = isOpen;
		}}
		value={formOpensOn}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		record={complex.name}
		blockers={complexBlockers}
		onSubmit={deleteComplex}
	/>
{/if}
