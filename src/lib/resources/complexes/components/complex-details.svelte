<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Button } from '$lib/common/components/fragments/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import * as Tabs from '$lib/common/components/fragments/tabs';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ComplexesTableUnitsCount from '$lib/resources/complexes/components/complexes-table-units-count.svelte';
	import { useDeleteComplex, useFetchComplex } from '$lib/resources/complexes/hooks/queries';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ComplexForm from './complex-form.svelte';
	import UnitsDataView from './units-data-view.svelte';

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
	const tabsListClass =
		'grid h-auto w-full grid-cols-2 rounded-[1.3rem] border border-border/70 bg-card/55 p-0.5 shadow-lg backdrop-blur-xl';
	const tabsTriggerClass =
		'capitalize rounded-[1rem] px-3 py-2 text-sm font-medium data-[state=active]:border-border/50 data-[state=active]:bg-background/80 data-[state=active]:text-foreground data-[state=active]:shadow-sm';

	let isComplexFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	async function deleteComplex() {
		if (!complexQuery.data) return;

		await deleteMutation.mutateAsync(complexQuery.data.id);
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

		// eslint-disable-next-line svelte/no-navigation-without-resolve
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
	<Card class="border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const complex = complexQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div class="rounded-[1.5rem] border border-border/70 bg-card/65 p-4 shadow-xl backdrop-blur-xl">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								href={resolve('/complexes')}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.ui.previous()}
								class="shrink-0 rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
							>
								<ArrowLeftIcon class="size-4 rtl:rotate-180" />
								<span class="sr-only">{$LL.common.ui.previous()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.ui.previous()}
					</Tooltip.Content>
				</Tooltip.Root>

				<div class="flex flex-wrap items-center justify-end gap-2">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.common.actions.edit()}
									class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
									onclick={() => (isComplexFormOpen = true)}
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
				<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
					<CardHeader class="gap-2 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3 py-4">
						<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
							<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.location()}
								</p>
								<p class="mt-3 text-sm font-medium">{complex.location}</p>
							</div>

							<div class="rounded-xl border border-primary/10 bg-primary/5 p-4 backdrop-blur-sm">
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

			<Tabs.Content value="units" class="min-h-0 flex-1 pt-1">
				<UnitsDataView {complexId} showHeader={false} />
			</Tabs.Content>
		</Tabs.Root>
	</div>

	<ComplexForm
		open={isComplexFormOpen}
		onOpenChange={(isOpen) => {
			isComplexFormOpen = isOpen;
		}}
		value={complex}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		onSubmit={deleteComplex}
	/>
{/if}
