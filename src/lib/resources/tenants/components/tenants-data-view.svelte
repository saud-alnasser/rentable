<script lang="ts">
	import type { Tenant } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useDeleteTenant, useInfiniteTenants } from '$lib/resources/tenants/hooks/queries';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TenantForm from './tenant-form.svelte';

	let search = $state('');

	const fetchQuery = useInfiniteTenants(() => ({ search }));
	const deleteMutation = useDeleteTenant();

	let isTenantFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let tenant = $state<Tenant | undefined>(undefined);

	const getSearchValue = (record: Tenant) =>
		[record.name, record.phone, record.nationalId].filter(Boolean).join(' ');
	let tenants = $derived.by(
		() => fetchQuery.data?.pages.flatMap((page: { items: Tenant[] }) => page.items) ?? []
	);

	const getTenantInitials = (name: string) =>
		name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
</script>

<DataView
	data={tenants}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	hasNextPage={fetchQuery.hasNextPage}
	isFetchingNextPage={fetchQuery.isFetchingNextPage}
	fetchNextPage={() => fetchQuery.fetchNextPage()}
	bind:searchValue={search}
	{getSearchValue}
	virtualItemHeight={220}
	onCreate={() => {
		tenant = undefined;
		isTenantFormOpen = true;
	}}
>
	{#snippet item(record: Tenant)}
		<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
			<CardHeader class="gap-3 border-b pb-4">
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
					>
						{getTenantInitials(record.name)}
					</div>
					<div class="min-w-0 space-y-1">
						<CardTitle class="truncate">{record.name}</CardTitle>
						<CardDescription class="truncate">#{record.id}</CardDescription>
					</div>
				</div>
				<CardAction>
					<DataTableActionsDropdown
						menuLabel={null}
						actions={[
							{
								label: $LL.common.actions.edit(),
								icon: SquarePenIcon,
								onclick: () => {
									tenant = record;
									isTenantFormOpen = true;
								}
							},
							{ type: 'separator' as const },
							{
								label: $LL.common.actions.delete(),
								icon: Trash2Icon,
								variant: 'destructive' as const,
								onclick: () => {
									tenant = record;
									isDeleteDialogOpen = true;
								}
							}
						]}
					/>
				</CardAction>
			</CardHeader>
			<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.nationalId()}
					</p>
					<p class="mt-2 text-sm font-medium">{record.nationalId}</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.phone()}
					</p>
					<p class="mt-2 text-sm font-medium">{record.phone}</p>
				</div>
			</CardContent>
		</Card>
	{/snippet}
</DataView>

<TenantForm
	open={isTenantFormOpen}
	onOpenChange={(isOpen) => {
		isTenantFormOpen = isOpen;
		if (!isOpen) tenant = undefined;
	}}
	value={tenant}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) tenant = undefined;
	}}
	onSubmit={async () => {
		if (tenant) {
			await deleteMutation.mutateAsync(tenant.id);
		}
	}}
/>
