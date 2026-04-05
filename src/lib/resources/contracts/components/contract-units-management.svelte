<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Label } from '$lib/common/components/fragments/label';
	import { ScrollArea } from '$lib/common/components/fragments/scroll-area';
	import * as Select from '$lib/common/components/fragments/select';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { useFetchComplexes } from '$lib/resources/complexes/hooks/queries';
	import {
		useAssignContractUnits,
		useFetchContract,
		useFetchContractUnits,
		useFetchVacantContractUnits,
		useRemoveContractUnit
	} from '$lib/resources/contracts/hooks/queries';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { tick } from 'svelte';
	import { get } from 'svelte/store';

	let {
		contractId,
		backHref,
		showHeader = true
	}: {
		contractId: number;
		backHref?: string;
		showHeader?: boolean;
	} = $props();

	const contractQuery = useFetchContract(() => contractId);
	const complexesQuery = useFetchComplexes();
	const assignedUnitsQuery = useFetchContractUnits(() => contractId);
	const assignMutation = useAssignContractUnits();
	const removeMutation = useRemoveContractUnit();
	const listRowGap = 12;
	const virtualListClass =
		'rounded-[1.5rem] border border-border/70 bg-background/30 shadow-lg backdrop-blur-xl';
	const virtualListPaddingClass = 'p-2 sm:p-3';
	const standaloneVirtualThreshold = 3;
	const embeddedVirtualThreshold = 3;
	const availableVirtualEstimate = 104;
	const assignedVirtualEstimate = 172;
	const standaloneVirtualViewportHeight = 'min(58vh, 34rem)';
	const embeddedVirtualViewportHeight = '24rem';
	const trackEffectDependencies = (...values: unknown[]) => values.length;

	let selectedComplexId = $state('');
	let selectedUnitIds = $state<number[]>([]);
	let availableViewportRef = $state<HTMLElement | null>(null);
	let assignedViewportRef = $state<HTMLElement | null>(null);
	let availableViewportWidth = $state(0);
	let assignedViewportWidth = $state(0);
	let windowWidth = $state(browser ? window.innerWidth : 0);

	let selectedComplexNumber = $derived.by(() => {
		const parsed = Number(selectedComplexId);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});

	let hasRegisteredPayments = $derived.by(() => (contractQuery.data?.paidAmount ?? 0) > 0);
	let isTerminated = $derived(contractQuery.data?.status === 'terminated');
	let isLocked = $derived(isTerminated || hasRegisteredPayments);

	let selectedComplex = $derived.by(() =>
		(complexesQuery.data ?? []).find((complex) => complex.id.toString() === selectedComplexId)
	);
	let previousSelectedComplexNumber = $state<number | undefined>(undefined);

	const vacantUnitsQuery = useFetchVacantContractUnits(() => ({
		contractId,
		complexId: selectedComplexNumber
	}));

	const toRows = <T,>(items: T[], columnCount: number) =>
		Array.from({ length: Math.ceil(items.length / columnCount) }, (_, rowIndex) =>
			items.slice(rowIndex * columnCount, (rowIndex + 1) * columnCount)
		);

	let availableUnits = $derived(vacantUnitsQuery.data ?? []);
	let assignedUnits = $derived(assignedUnitsQuery.data ?? []);
	type AvailableUnitRecord = (typeof availableUnits)[number];
	type AssignedUnitRecord = (typeof assignedUnits)[number];
	let availableLayoutWidth = $derived(availableViewportWidth || windowWidth);
	let assignedLayoutWidth = $derived(assignedViewportWidth || windowWidth);
	let availableColumnCount = $derived(availableLayoutWidth >= 768 ? 2 : 1);
	let assignedColumnCount = $derived(assignedLayoutWidth >= 1024 ? 2 : 1);
	let availableGridTemplateStyle = $derived(
		`grid-template-columns: repeat(${availableColumnCount}, minmax(0, 1fr));`
	);
	let assignedGridTemplateStyle = $derived(
		`grid-template-columns: repeat(${assignedColumnCount}, minmax(0, 1fr));`
	);
	let availableRows = $derived.by(() => toRows(availableUnits, availableColumnCount));
	let assignedRows = $derived.by(() => toRows(assignedUnits, assignedColumnCount));
	let availableRowKeys = $derived.by(() =>
		availableRows.map((row) => row.map((unit) => String(unit.id)).join(':'))
	);
	let assignedRowKeys = $derived.by(() =>
		assignedRows.map((row) => row.map((unit) => String(unit.id)).join(':'))
	);
	let virtualThreshold = $derived(
		showHeader ? standaloneVirtualThreshold : embeddedVirtualThreshold
	);
	let virtualViewportHeight = $derived(
		showHeader ? standaloneVirtualViewportHeight : embeddedVirtualViewportHeight
	);
	let shouldUseVirtualAvailable = $derived(availableUnits.length >= virtualThreshold);
	let shouldUseVirtualAssigned = $derived(assignedUnits.length >= virtualThreshold);
	let shouldConstrainLayout = $derived(shouldUseVirtualAvailable || shouldUseVirtualAssigned);
	let isAvailableVirtualReady = $derived(
		browser && shouldUseVirtualAvailable && !!availableViewportRef && availableViewportWidth > 0
	);
	let isAssignedVirtualReady = $derived(
		browser && shouldUseVirtualAssigned && !!assignedViewportRef && assignedViewportWidth > 0
	);

	const availableVirtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => availableVirtualEstimate,
		overscan: 2,
		gap: listRowGap,
		enabled: false
	});

	const assignedVirtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => assignedVirtualEstimate,
		overscan: 2,
		gap: listRowGap,
		enabled: false
	});

	let virtualAvailableRows = $derived($availableVirtualizer.getVirtualItems());
	let virtualAssignedRows = $derived($assignedVirtualizer.getVirtualItems());
	let availablePaddingTop = $derived(virtualAvailableRows[0]?.start ?? 0);
	let assignedPaddingTop = $derived(virtualAssignedRows[0]?.start ?? 0);
	let availablePaddingBottom = $derived(
		Math.max(
			$availableVirtualizer.getTotalSize() -
				(virtualAvailableRows[virtualAvailableRows.length - 1]?.end ?? 0),
			0
		)
	);
	let assignedPaddingBottom = $derived(
		Math.max(
			$assignedVirtualizer.getTotalSize() -
				(virtualAssignedRows[virtualAssignedRows.length - 1]?.end ?? 0),
			0
		)
	);

	const getContractLabel = () => {
		const govId = contractQuery.data?.govId?.trim();

		return govId || undefined;
	};

	const formatContractTitle = () => {
		if (contractQuery.isLoading) return $LL.contracts.units.loadingContract();

		const contractLabel = getContractLabel();

		return contractLabel
			? $LL.contracts.units.unitsFor({ govId: contractLabel })
			: $LL.contracts.units.unitsTitle();
	};

	const getLockSummary = () => {
		if (isTerminated) {
			return $LL.contracts.units.lockSummaryTerminated();
		}

		if (hasRegisteredPayments) {
			return $LL.contracts.units.lockSummaryHasPayments();
		}

		return $LL.contracts.units.lockSummaryDefault();
	};

	const getLockNotice = () => {
		if (isTerminated) {
			return $LL.contracts.units.lockNoticeTerminated();
		}

		if (hasRegisteredPayments) {
			return $LL.contracts.units.lockNoticeHasPayments();
		}

		return undefined;
	};

	function toggleUnit(unitId: number, checked: boolean) {
		if (isLocked) return;

		selectedUnitIds = checked
			? [...new Set([...selectedUnitIds, unitId])]
			: selectedUnitIds.filter((id) => id !== unitId);
	}

	async function assignUnits() {
		if (isLocked || !selectedComplexNumber || selectedUnitIds.length === 0) return;

		await assignMutation.mutateAsync({
			contractId,
			complexId: selectedComplexNumber,
			unitIds: selectedUnitIds
		});

		selectedUnitIds = [];
	}

	$effect(() => {
		if (previousSelectedComplexNumber === selectedComplexNumber) return;

		previousSelectedComplexNumber = selectedComplexNumber;
		selectedUnitIds = [];
	});

	$effect(() => {
		if (!browser) return;

		const syncWindowWidth = () => {
			windowWidth = window.innerWidth;
		};

		syncWindowWidth();
		window.addEventListener('resize', syncWindowWidth, { passive: true });

		return () => {
			window.removeEventListener('resize', syncWindowWidth);
		};
	});

	$effect(() => {
		if (!browser || !availableViewportRef) {
			availableViewportWidth = 0;
			return;
		}

		const viewport = availableViewportRef;
		const syncViewportWidth = () => {
			availableViewportWidth = viewport.clientWidth;
		};

		syncViewportWidth();

		const resizeObserver = new ResizeObserver(syncViewportWidth);
		resizeObserver.observe(viewport);

		return () => {
			resizeObserver.disconnect();
		};
	});

	$effect(() => {
		if (!browser || !assignedViewportRef) {
			assignedViewportWidth = 0;
			return;
		}

		const viewport = assignedViewportRef;
		const syncViewportWidth = () => {
			assignedViewportWidth = viewport.clientWidth;
		};

		syncViewportWidth();

		const resizeObserver = new ResizeObserver(syncViewportWidth);
		resizeObserver.observe(viewport);

		return () => {
			resizeObserver.disconnect();
		};
	});

	$effect(() => {
		get(availableVirtualizer).setOptions({
			count: availableRows.length,
			getScrollElement: () => availableViewportRef,
			estimateSize: () => availableVirtualEstimate,
			getItemKey: (index) => availableRowKeys[index] ?? index,
			overscan: 2,
			gap: listRowGap,
			enabled: isAvailableVirtualReady
		});
	});

	$effect(() => {
		get(assignedVirtualizer).setOptions({
			count: assignedRows.length,
			getScrollElement: () => assignedViewportRef,
			estimateSize: () => assignedVirtualEstimate,
			getItemKey: (index) => assignedRowKeys[index] ?? index,
			overscan: 2,
			gap: listRowGap,
			enabled: isAssignedVirtualReady
		});
	});

	$effect(() => {
		if (!isAvailableVirtualReady) return;

		trackEffectDependencies(availableColumnCount, availableRowKeys);

		void tick().then(() => {
			get(availableVirtualizer).measure();
		});
	});

	$effect(() => {
		if (!isAssignedVirtualReady) return;

		trackEffectDependencies(assignedColumnCount, assignedRowKeys);

		void tick().then(() => {
			get(assignedVirtualizer).measure();
		});
	});

	function measureAvailableRow(node: HTMLDivElement, rowKey: string) {
		void rowKey;
		const instance = get(availableVirtualizer);
		instance.measureElement(node);

		return {
			update(nextRowKey: string) {
				void nextRowKey;
				instance.measureElement(node);
			},
			destroy() {
				instance.measureElement(null);
			}
		};
	}

	function measureAssignedRow(node: HTMLDivElement, rowKey: string) {
		void rowKey;
		const instance = get(assignedVirtualizer);
		instance.measureElement(node);

		return {
			update(nextRowKey: string) {
				void nextRowKey;
				instance.measureElement(node);
			},
			destroy() {
				instance.measureElement(null);
			}
		};
	}
</script>

{#snippet availableUnitCard(unit: AvailableUnitRecord)}
	{@const isSelected = selectedUnitIds.includes(unit.id)}
	<button
		type="button"
		class={cn(
			'flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 p-4 text-start shadow-sm transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-background',
			isSelected && 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
		)}
		aria-pressed={isSelected}
		onclick={() => toggleUnit(unit.id, !isSelected)}
	>
		<div
			class={cn(
				'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-transparent transition-colors',
				isSelected && 'border-primary bg-primary text-primary-foreground'
			)}
		>
			<CheckIcon class="size-3.5" />
		</div>
		<div class="min-w-0 flex-1">
			<p class="truncate font-medium">{unit.name}</p>
		</div>
	</button>
{/snippet}

{#snippet assignedUnitCard(unit: AssignedUnitRecord)}
	<div
		class="rounded-[1.25rem] border border-border/70 bg-background/60 p-4 shadow-lg backdrop-blur-md"
	>
		<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
			<div class="min-w-0 space-y-1 text-start">
				<p class="truncate font-semibold">{unit.name}</p>
			</div>
			{#if !isLocked}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="icon-sm"
								disabled={isLocked || removeMutation.isPending}
								class="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
								aria-label={$LL.common.actions.remove()}
								onclick={async () => {
									if (isLocked) return;
									await removeMutation.mutateAsync({ contractId, unitId: unit.id });
								}}
							>
								<Trash2Icon class="size-4" />
								<span class="sr-only">{$LL.common.actions.remove()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.actions.remove()}
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>

		<div class="mt-4 [&>*]:text-start">
			<div class="rounded-xl border border-border/60 bg-accent/30 p-3 backdrop-blur-sm">
				<p class="text-xs tracking-wide text-muted-foreground uppercase">
					{$LL.common.labels.complex()}
				</p>
				<p class="mt-2 text-sm font-medium">{unit.complexName}</p>
			</div>
		</div>
	</div>
{/snippet}

<div
	class={cn('flex flex-col gap-4', shouldConstrainLayout && 'xl:min-h-0 xl:flex-1')}
	dir={localesMetadata[$locale].direction}
>
	{#if showHeader}
		{#if contractQuery.isLoading}
			<div class="space-y-3">
				<Skeleton class="h-8 w-48" />
				<Skeleton class="h-4 w-72" />
			</div>
		{:else}
			<div class="space-y-2">
				{#if backHref}
					<div class="flex items-center gap-3 rtl:flex-row-reverse">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										href={backHref}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.ui.previous()}
										class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
									>
										<ArrowLeftIcon class="size-4 rtl:rotate-180" />
										<span class="sr-only">{$LL.common.ui.previous()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>{$LL.common.ui.previous()}</Tooltip.Content
							>
						</Tooltip.Root>
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.nav.contracts()}
						</p>
					</div>
				{/if}
				<h1 class="text-2xl font-semibold tracking-tight">{formatContractTitle()}</h1>
				<p class="text-sm text-muted-foreground">{getLockSummary()}</p>
			</div>
		{/if}
	{/if}

	{#if isLocked}
		<p
			class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground backdrop-blur-sm"
		>
			{getLockNotice()}
		</p>
	{/if}

	<div
		class={cn(
			'grid gap-3',
			shouldConstrainLayout && 'xl:min-h-0 xl:flex-1',
			!isLocked && 'xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]'
		)}
	>
		{#if !isLocked}
			<Card
				class={cn(
					'gap-0 border-border/70 bg-card/65 shadow-xl backdrop-blur-xl',
					shouldConstrainLayout && 'xl:min-h-0'
				)}
			>
				<CardHeader class="gap-3 border-b border-border/50 pb-4">
					<div class="flex items-start gap-3">
						<div
							class="rounded-xl border border-border/70 bg-background/60 p-2.5 shadow-sm backdrop-blur-md"
						>
							<Building2Icon class="size-5 text-primary" />
						</div>
						<div class="space-y-1">
							<CardTitle>{$LL.contracts.units.availableTitle()}</CardTitle>
							<CardDescription>{$LL.contracts.units.availableDescription()}</CardDescription>
						</div>
					</div>
				</CardHeader>

				<CardContent class="space-y-3 pt-4 xl:min-h-0">
					<div
						class="grid gap-3 rounded-[1.25rem] border border-border/70 bg-accent/25 p-3 backdrop-blur-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
					>
						<div class="space-y-2">
							<Label>{$LL.common.labels.complex()}</Label>
							<Select.Root type="single" bind:value={selectedComplexId}>
								<Select.Trigger class="w-full" disabled={complexesQuery.isLoading || isLocked}>
									{selectedComplex?.name ||
										(complexesQuery.isLoading
											? $LL.common.messages.loadingComplexes()
											: $LL.contracts.units.selectComplexPlaceholder())}
								</Select.Trigger>
								<Select.Content>
									{#each complexesQuery.data ?? [] as complex (complex.id)}
										<Select.Item value={complex.id.toString()} label={complex.name} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<Button
							onclick={assignUnits}
							disabled={isLocked ||
								!selectedComplexNumber ||
								selectedUnitIds.length === 0 ||
								assignMutation.isPending}
							class="min-w-40 capitalize"
						>
							{assignMutation.isPending
								? $LL.common.actions.assigning()
								: $LL.common.actions.assignSelected()}
							{#if selectedUnitIds.length > 0}
								<span class="text-xs opacity-80">({selectedUnitIds.length})</span>
							{/if}
						</Button>
					</div>

					{#if selectedComplex}
						<div
							class="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 text-sm shadow-sm"
						>
							<span class="text-muted-foreground">{$LL.common.labels.complex()}</span>
							<span class="font-medium">{selectedComplex.name}</span>
						</div>
					{/if}

					{#if !selectedComplexNumber}
						<p
							class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
						>
							{$LL.contracts.units.selectComplex()}
						</p>
					{:else if vacantUnitsQuery.isLoading}
						<div class="grid gap-3 md:grid-cols-2">
							<Skeleton class="h-24 w-full rounded-xl" />
							<Skeleton class="h-24 w-full rounded-xl" />
							<Skeleton class="h-24 w-full rounded-xl" />
							<Skeleton class="h-24 w-full rounded-xl" />
						</div>
					{:else if (vacantUnitsQuery.data?.length ?? 0) === 0}
						<p
							class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
						>
							{$LL.contracts.units.noAvailableUnits()}
						</p>
					{:else if shouldUseVirtualAvailable}
						<ScrollArea
							bind:viewportRef={availableViewportRef}
							class={virtualListClass}
							style={`height: ${virtualViewportHeight};`}
						>
							{#if isAvailableVirtualReady}
								<div class={cn('relative w-full', virtualListPaddingClass)}>
									{#if availablePaddingTop > 0}
										<div aria-hidden="true" style={`height: ${availablePaddingTop}px;`}></div>
									{/if}

									<div class="flex flex-col gap-3">
										{#each virtualAvailableRows as virtualRow (virtualRow.key)}
											<div
												use:measureAvailableRow={availableRowKeys[virtualRow.index] ?? ''}
												class="w-full"
											>
												<div class="grid gap-3" style={availableGridTemplateStyle}>
													{#each availableRows[virtualRow.index] ?? [] as unit (unit.id)}
														{@render availableUnitCard(unit)}
													{/each}
												</div>
											</div>
										{/each}
									</div>

									{#if availablePaddingBottom > 0}
										<div aria-hidden="true" style={`height: ${availablePaddingBottom}px;`}></div>
									{/if}
								</div>
							{:else}
								<div
									class={cn('grid gap-3', virtualListPaddingClass)}
									style={availableGridTemplateStyle}
								>
									{#each availableUnits as unit (unit.id)}
										{@render availableUnitCard(unit)}
									{/each}
								</div>
							{/if}
						</ScrollArea>
					{:else}
						<div class={cn(virtualListClass, virtualListPaddingClass)}>
							<div class="grid gap-3" style={availableGridTemplateStyle}>
								{#each availableUnits as unit (unit.id)}
									{@render availableUnitCard(unit)}
								{/each}
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/if}

		<Card
			class={cn(
				'gap-0 border-border/70 bg-card/65 shadow-xl backdrop-blur-xl',
				shouldConstrainLayout && 'xl:min-h-0'
			)}
		>
			<CardHeader class="gap-3 border-b border-border/50 pb-4">
				<div class="space-y-1">
					<CardTitle>{$LL.contracts.units.assignedTitle()}</CardTitle>
					<CardDescription>
						{isLocked
							? $LL.contracts.units.assignedDescriptionLocked()
							: $LL.contracts.units.assignedDescriptionEditable()}
					</CardDescription>
				</div>
			</CardHeader>

			<CardContent class="pt-4 xl:min-h-0">
				{#if assignedUnitsQuery.isLoading}
					<div class="grid gap-3 lg:grid-cols-2">
						<Skeleton class="h-32 w-full rounded-xl" />
						<Skeleton class="h-32 w-full rounded-xl" />
					</div>
				{:else if (assignedUnitsQuery.data?.length ?? 0) === 0}
					<p
						class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
					>
						{$LL.contracts.units.noAssignedUnits()}
					</p>
				{:else if shouldUseVirtualAssigned}
					<ScrollArea
						bind:viewportRef={assignedViewportRef}
						class={virtualListClass}
						style={`height: ${virtualViewportHeight};`}
					>
						{#if isAssignedVirtualReady}
							<div class={cn('relative w-full', virtualListPaddingClass)}>
								{#if assignedPaddingTop > 0}
									<div aria-hidden="true" style={`height: ${assignedPaddingTop}px;`}></div>
								{/if}

								<div class="flex flex-col gap-3">
									{#each virtualAssignedRows as virtualRow (virtualRow.key)}
										<div
											use:measureAssignedRow={assignedRowKeys[virtualRow.index] ?? ''}
											class="w-full"
										>
											<div class="grid gap-3" style={assignedGridTemplateStyle}>
												{#each assignedRows[virtualRow.index] ?? [] as unit (unit.id)}
													{@render assignedUnitCard(unit)}
												{/each}
											</div>
										</div>
									{/each}
								</div>

								{#if assignedPaddingBottom > 0}
									<div aria-hidden="true" style={`height: ${assignedPaddingBottom}px;`}></div>
								{/if}
							</div>
						{:else}
							<div
								class={cn('grid gap-3', virtualListPaddingClass)}
								style={assignedGridTemplateStyle}
							>
								{#each assignedUnits as unit (unit.id)}
									{@render assignedUnitCard(unit)}
								{/each}
							</div>
						{/if}
					</ScrollArea>
				{:else}
					<div class={cn(virtualListClass, virtualListPaddingClass)}>
						<div class="grid gap-3" style={assignedGridTemplateStyle}>
							{#each assignedUnits as unit (unit.id)}
								{@render assignedUnitCard(unit)}
							{/each}
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>
