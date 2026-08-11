<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tabs from '$lib/design/primitive/tabs';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { useDeleteTenant, useFetchTenant } from '$lib/tenant/query';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TenantContracts from './contracts.svelte';
	import TenantForm from './form.svelte';

	type TenantDetailsSection = 'overview' | 'contracts';

	let {
		tenantId,
		initialSection = 'overview'
	}: {
		tenantId: number;
		initialSection?: TenantDetailsSection;
	} = $props();
	// eslint-disable-next-line svelte/prefer-writable-derived
	let activeSection = $state<TenantDetailsSection>('overview');

	const tabsListClass = 'grid h-auto w-full grid-cols-2';
	const tabsTriggerClass = 'capitalize';

	const getSectionHref = (section: TenantDetailsSection) =>
		resolve(`/tenants/${tenantId}${section === 'overview' ? '' : `?section=${section}`}`);

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

	const tenantQuery = useFetchTenant(() => ({
		id: Number.isInteger(tenantId) && tenantId > 0 ? tenantId : undefined,
		enabled: Number.isInteger(tenantId) && tenantId > 0
	}));
	const deleteMutation = useDeleteTenant();

	let isTenantFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	async function deleteTenant() {
		if (!tenantQuery.data) return;

		await deleteMutation.mutateAsync(tenantQuery.data.id);
		await goto(resolve('/tenants'));
	}
</script>

{#if tenantQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !tenantQuery.data}
	<Card>
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const tenant = tenantQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-4">
		<div class="rounded-2xl border bg-muted p-4">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								href={resolve('/tenants')}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.ui.previous()}
								class="shrink-0 rounded-full bg-secondary"
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
									class="rounded-full bg-secondary"
									onclick={() => (isTenantFormOpen = true)}
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

			<div class="mt-5 min-w-0 space-y-1 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.nav.tenants()}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{tenant.name}</h1>
				<p class="text-sm text-muted-foreground">{tenant.phone}</p>
			</div>
		</div>

		<Tabs.Root bind:value={activeSection} class="min-h-0 flex-1 gap-3">
			<Tabs.List class={tabsListClass}>
				<Tabs.Trigger value="overview" class={tabsTriggerClass}>
					{$LL.common.labels.information()}
				</Tabs.Trigger>
				<Tabs.Trigger value="contracts" class={tabsTriggerClass}>
					{$LL.common.nav.contracts()}
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="overview" class="pb-1">
				<Card>
					<CardHeader class="gap-3 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="pt-4">
						<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.nationalId()}
								</p>
								<p class="mt-3 text-lg font-semibold">{tenant.nationalId}</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.phone()}
								</p>
								<p class="mt-3 text-lg font-semibold" dir={localesMetadata[$locale].direction}>
									{tenant.phone}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</Tabs.Content>

			<Tabs.Content value="contracts" class="min-h-0 flex-1 pt-1">
				<TenantContracts {tenantId} />
			</Tabs.Content>
		</Tabs.Root>
	</div>

	<TenantForm
		open={isTenantFormOpen}
		onOpenChange={(isOpen) => {
			isTenantFormOpen = isOpen;
		}}
		value={tenant}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		onSubmit={deleteTenant}
	/>
{/if}
