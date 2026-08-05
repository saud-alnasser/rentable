<script lang="ts">
	import type api from '$lib/api/caller';
	import { useDeleteUnit, useListUnits } from '$lib/complex/query';
	import DataTableActionsDropdown from '$lib/design/block/data-table-actions-dropdown.svelte';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { cn } from '$lib/design/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitForm from './unit-form.svelte';

	type UnitRecord = Awaited<ReturnType<typeof api.complex.units.getMany>>[number];

	let { complexId }: { complexId: number } = $props();

	// a tile's name, its occupancy line, and the padding that separates it from its
	// neighbours; the shell lays tiles out at this height rather than measuring them.
	const TILE_HEIGHT = 92;
	// wide enough to hold the status badge and a tenant's name before either truncates. The
	// shell fits as many of these as the window allows and reflows to one where it cannot.
	const TILE_MIN_WIDTH = 220;

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
	recordHeight={TILE_HEIGHT}
	recordMinWidth={TILE_MIN_WIDTH}
	onCreate={() => {
		unit = undefined;
		isUnitFormOpen = true;
	}}
>
	{#snippet record(record: UnitRecord)}
		<div class="h-full p-1.5">
			<div
				class={cn(
					'flex h-full flex-col justify-between rounded-xl border p-3 transition-colors hover:bg-muted/40',
					record.status === 'occupied' ? 'bg-card' : 'border-dashed'
				)}
			>
				<div class="flex items-start justify-between gap-2">
					<span class="min-w-0 truncate text-sm font-medium">{record.name}</span>
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

				<div class="flex min-w-0 items-center gap-2">
					<Cell.Status status={record.status} />
					{#if record.tenantName}
						<span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
							<UserIcon class="size-3.5 shrink-0" />
							<span class="truncate">{record.tenantName}</span>
						</span>
					{/if}
				</div>
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
