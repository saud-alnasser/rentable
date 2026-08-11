<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import { useDeleteUnit, useListUnits } from '$lib/complex/query';
	import DataTableActionsDropdown from '$lib/design/block/data-table-actions-dropdown.svelte';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { LL } from '$lib/i18n/i18n-svelte';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitForm from './unit-form.svelte';

	type UnitRecord = Awaited<ReturnType<typeof api.complex.units.getMany>>[number];

	let { complexId }: { complexId: number } = $props();

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let unit = $state<UnitRecord | undefined>(undefined);
	let isUnitFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	const unitsQuery = useListUnits(
		() => complexId,
		() => search
	);
	const units = $derived(unitsQuery.data ?? []);
	const deleteMutation = useDeleteUnit();
</script>

<List
	data={units}
	bind:search
	isLoading={unitsQuery.isLoading}
	isFetching={unitsQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	onCreate={() => {
		unit = undefined;
		isUnitFormOpen = true;
	}}
>
	{#snippet record(record: UnitRecord)}
		<div
			class="relative flex h-full items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40"
		>
			<!-- the link covers the row rather than wrapping it, so the row's own controls can sit
			     above it instead of being swallowed by its click target. -->
			<a
				href={resolve(`/complexes/units/${record.id}`)}
				class="absolute inset-0 rounded-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label={record.name}
			></a>

			<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
				<span class="truncate text-sm font-medium">{record.name}</span>
				<!-- who is in it, which is the question the board this replaced existed to answer. -->
				<span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					{#if record.tenantName}
						<UserIcon class="size-3.5 shrink-0" aria-hidden="true" />
						<span class="truncate">{record.tenantName}</span>
					{:else}
						<span class="truncate">{$LL.common.status.vacant()}</span>
					{/if}
				</span>
			</span>

			<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
				<Cell.Status status={record.status} />
			</span>

			<div class="relative flex size-8 shrink-0 items-center justify-center">
				<DataTableActionsDropdown
					menuLabel={null}
					actions={[
						{
							label: $LL.common.actions.edit(),
							icon: SquarePenIcon,
							onclick: () => {
								unit = record;
								isUnitFormOpen = true;
							}
						},
						{ type: 'separator' as const },
						{
							label: $LL.common.actions.delete(),
							icon: Trash2Icon,
							variant: 'destructive' as const,
							onclick: () => {
								unit = record;
								isDeleteDialogOpen = true;
							}
						}
					]}
				/>
			</div>
		</div>
	{/snippet}
</List>

<UnitForm
	open={isUnitFormOpen}
	onOpenChange={(isOpen) => {
		isUnitFormOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	value={unit}
	{complexId}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	onSubmit={async () => {
		if (unit) {
			await deleteMutation.mutateAsync(unit.id);
		}
	}}
/>
