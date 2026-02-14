<script lang="ts" generics="TData extends { id: number }, TValue">
	import { Button } from '$lib/common/components/fragments/button';
	import { createSvelteTable, FlexRender } from '$lib/common/components/fragments/data-table';
	import * as DropdownMenu from '$lib/common/components/fragments/dropdown-menu';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Select from '$lib/common/components/fragments/select';
	import * as Table from '$lib/common/components/fragments/table';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind';
	import { DragDropProvider } from '@dnd-kit-svelte/svelte';
	import { useSortable } from '@dnd-kit-svelte/svelte/sortable';
	import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
	import { move } from '@dnd-kit/helpers';
	import {
		IconChevronLeft,
		IconChevronRight,
		IconChevronsLeft,
		IconChevronsRight,
		IconLayoutColumns,
		IconLoader2,
		IconPlus
	} from '@tabler/icons-svelte';
	import {
		type ColumnDef,
		type ColumnFiltersState,
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type PaginationState,
		type Row,
		type RowSelectionState,
		type SortingState,
		type VisibilityState
	} from '@tanstack/table-core';

	type DataTableProps<TData, TValue> = {
		columns: ColumnDef<TData, TValue>[];
		data: TData[];
		isLoading?: boolean;
		onCreate: () => Promise<void> | void;
	};

	let { data, columns, isLoading = false, onCreate }: DataTableProps<TData, TValue> = $props();

	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });
	let sorting = $state<SortingState>([]);
	let columnFilters = $state<ColumnFiltersState>([]);
	let globalFilter = $state('');
	let columnVisibility = $state<VisibilityState>({});
	let rowSelection = $state<RowSelectionState>({});
	let hasDragColumn = $derived(columns.some((col) => col.id === 'drag'));
	let hasSelectColumn = $derived(columns.some((col) => col.id === 'select'));

	const table = createSvelteTable({
		get data() {
			return data;
		},
		get columns() {
			return columns;
		},
		state: {
			get pagination() {
				return pagination;
			},
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get globalFilter() {
				return globalFilter;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get rowSelection() {
				return rowSelection;
			}
		},
		onPaginationChange(updater) {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		onSortingChange(updater) {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange(updater) {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onGlobalFilterChange(updater) {
			if (typeof updater === 'function') {
				globalFilter = updater(globalFilter);
			} else {
				globalFilter = updater;
			}
		},
		onColumnVisibilityChange(updater) {
			if (typeof updater === 'function') {
				columnVisibility = updater(columnVisibility);
			} else {
				columnVisibility = updater;
			}
		},
		onRowSelectionChange(updater) {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
		},
		getRowId: (row) => row.id.toString(),
		enableRowSelection: true,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel()
	});
</script>

<div class="flex items-center justify-between gap-2 py-4">
	<Input
		placeholder="search..."
		value={globalFilter}
		oninput={(e) => {
			globalFilter = e.currentTarget.value;
		}}
		class="max-w-sm"
	/>
	<div class="flex items-center gap-2">
		<div>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button {...props} variant="outline" size="sm" class="ms-auto">
									<IconLayoutColumns />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content class="capitalize" side="top">customize columns</Tooltip.Content>
						</Tooltip.Root>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					{#each table
						.getAllColumns()
						.filter((col) => typeof col.accessorFn !== 'undefined' && col.getCanHide()) as column (column.id)}
						<DropdownMenu.CheckboxItem
							class="capitalize"
							checked={column.getIsVisible()}
							onCheckedChange={(value) => column.toggleVisibility(!!value)}
						>
							{column.id}
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
		<div>
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button variant="outline" size="sm" onclick={() => onCreate()}>
						<IconPlus />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content class="capitalize" side="top">new record</Tooltip.Content>
			</Tooltip.Root>
		</div>
	</div>
</div>
<div class="overflow-hidden rounded-lg border">
	<DragDropProvider modifiers={[RestrictToVerticalAxis]} onDragEnd={(e) => (data = move(data, e))}>
		<Table.Root class="w-full table-fixed">
			<Table.Header class="sticky top-0 z-10 bg-muted">
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head
								colspan={header.colSpan}
								class={cn(
									'px-3.5',
									header.column.id === 'actions' ? 'w-24' : '',
									header.column.id === 'select' ? 'w-8' : '',
									header.column.id === 'drag' ? 'w-8' : ''
								)}
							>
								{#if !header.isPlaceholder}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body class="**:data-[slot=table-cell]:first:w-8">
				{#if isLoading}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-32">
							<div class="flex items-center justify-center">
								<IconLoader2 class="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						</Table.Cell>
					</Table.Row>
				{:else if table.getRowModel().rows?.length}
					{#each table.getRowModel().rows as row, index (row.id)}
						{@render DraggableRow({ row, index })}
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-24 text-center">No results.</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</DragDropProvider>
</div>
<div class={cn('flex items-center px-4', hasSelectColumn ? 'justify-between' : 'justify-start')}>
	{#if hasSelectColumn}
		<div class="hidden flex-1 text-sm text-muted-foreground lg:flex">
			{table.getFilteredSelectedRowModel().rows.length} of
			{table.getFilteredRowModel().rows.length} row(s) selected.
		</div>
	{/if}
	<div
		class={cn('flex w-full items-center gap-8', hasSelectColumn ? 'lg:w-fit' : 'justify-between')}
	>
		<div class="hidden items-center gap-2 lg:flex">
			<Label for="rows-per-page" class="text-sm font-medium">Rows per page</Label>
			<Select.Root
				type="single"
				bind:value={
					() => `${table.getState().pagination.pageSize}`, (v) => table.setPageSize(Number(v))
				}
			>
				<Select.Trigger size="sm" class="w-20" id="rows-per-page">
					{table.getState().pagination.pageSize}
				</Select.Trigger>
				<Select.Content side="top">
					{#each [10, 20, 30, 40, 50] as pageSize (pageSize)}
						<Select.Item value={pageSize.toString()}>
							{pageSize}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="flex items-center gap-6 lg:w-fit">
			<div class="flex w-fit items-center justify-center text-sm font-medium">
				Page {table.getState().pagination.pageIndex + (table.getPageCount() >= 1 ? 1 : 0)} of
				{table.getPageCount()}
			</div>
			<div class="ms-auto flex items-center gap-2 lg:ms-0">
				<Button
					variant="outline"
					class="hidden h-8 w-8 p-0 lg:flex"
					onclick={() => table.setPageIndex(0)}
					disabled={!table.getCanPreviousPage()}
				>
					<span class="sr-only">Go to first page</span>
					<IconChevronsLeft />
				</Button>
				<Button
					variant="outline"
					class="size-8"
					size="icon"
					onclick={() => table.previousPage()}
					disabled={!table.getCanPreviousPage()}
				>
					<span class="sr-only">Go to previous page</span>
					<IconChevronLeft />
				</Button>
				<Button
					variant="outline"
					class="size-8"
					size="icon"
					onclick={() => table.nextPage()}
					disabled={!table.getCanNextPage()}
				>
					<span class="sr-only">Go to next page</span>
					<IconChevronRight />
				</Button>
				<Button
					variant="outline"
					class="hidden size-8 lg:flex"
					size="icon"
					onclick={() => table.setPageIndex(table.getPageCount() - 1)}
					disabled={!table.getCanNextPage()}
				>
					<span class="sr-only">Go to last page</span>
					<IconChevronsRight />
				</Button>
			</div>
		</div>
	</div>
</div>

{#snippet DraggableRow({ row, index }: { row: Row<TData>; index: number })}
	{@const sortable = hasDragColumn
		? useSortable({
				id: row.original.id,
				index: () => index
			})
		: null}

	<Table.Row
		data-state={row.getIsSelected() && 'selected'}
		data-dragging={sortable?.isDragging.current}
		class={cn(
			'relative z-0',
			hasDragColumn ? 'data-[dragging=true]:z-10 data-[dragging=true]:opacity-80' : ''
		)}
		{@attach sortable?.ref}
	>
		{#each row.getVisibleCells() as cell (cell.id)}
			<Table.Cell
				class={cn(
					'px-3.5',
					cell.column.id === 'select' ? 'w-8' : '',
					cell.column.id === 'drag' ? 'w-8' : ''
				)}
			>
				<FlexRender
					attach={hasDragColumn && cell.column.id === 'drag' ? sortable?.handleRef : undefined}
					content={cell.column.columnDef.cell}
					context={cell.getContext()}
				/>
			</Table.Cell>
		{/each}
	</Table.Row>
{/snippet}
