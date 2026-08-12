<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordSurface from '$lib/design/block/record-surface.svelte';
	import Specification from '$lib/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useDeleteTenant, useFetchTenant } from '$lib/tenant/query';
	import { useListContracts } from '$lib/contract/query';
	import { isTenantDeletable } from '$lib/tenant/tenant';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TenantContracts from './contracts.svelte';
	import TenantForm from './form.svelte';

	let { tenantId }: { tenantId: number } = $props();

	const tenantQuery = useFetchTenant(() => ({
		id: Number.isInteger(tenantId) && tenantId > 0 ? tenantId : undefined,
		enabled: Number.isInteger(tenantId) && tenantId > 0
	}));
	const tenant = $derived(tenantQuery.data);
	const deleteMutation = useDeleteTenant();

	// what a deletion would be refused for, read before the question is asked rather than
	// after the destructive control is pressed.
	const heldContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ tenantId })
	);
	const tenantBlockers = $derived.by(() => {
		if (heldContractsQuery.isPending) return AWAITING_BLOCKERS;

		const held = heldContractsQuery.data ?? [];

		return isTenantDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedContracts({ count: held.length })];
	});

	let formOpensOn = $state<NonNullable<typeof tenantQuery.data> | undefined>(undefined);
	let isTenantFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	async function deleteTenant() {
		if (!tenant) return;

		await deleteMutation.mutateAsync(tenant.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

		await goto(resolve('/tenants'));
	}
</script>

{#snippet actions()}
	<RecordActions
		details={[
			{ label: $LL.common.labels.name(), value: tenant?.name ?? '' },
			{ label: $LL.common.labels.nationalId(), value: tenant?.nationalId ?? '' },
			{ label: $LL.common.labels.phone(), value: tenant?.phone ?? '' }
		]}
	/>

	<RecordActionControl
		label={$LL.common.actions.edit()}
		icon={SquarePenIcon}
		onclick={() => {
			formOpensOn = tenant;
			isTenantFormOpen = true;
		}}
	/>

	<RecordActionControl
		label={$LL.common.actions.delete()}
		icon={Trash2Icon}
		tone="destructive"
		onclick={() => (isDeleteDialogOpen = true)}
	/>
{/snippet}

{#snippet phone()}
	<Cell.Phone phone={tenant?.phone ?? ''} />
{/snippet}

<!-- both identifiers are labelled, and the phone number no longer reads unlabelled above the
     name. _Labels are a last resort_ ends by carving out this case: a label is wanted where
     several pieces of similar data have to be scannable, and two digit strings on one screen
     are exactly that — format tells a phone number from prose, not from a national id. -->
{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.nationalId(), value: tenant?.nationalId ?? '' },
			{ label: $LL.common.labels.phone(), value: phone }
		]}
	/>
{/snippet}

{#snippet contracts()}
	<TenantContracts {tenantId} />
{/snippet}

<RecordSurface
	isLoading={tenantQuery.isLoading}
	found={Boolean(tenant)}
	backFallback={resolve('/tenants')}
	path={resolve(`/tenants/${tenantId}`)}
	eyebrow={$LL.common.nav.tenants()}
	title={tenant?.name ?? ''}
	{actions}
	{fields}
	collections={[{ value: 'contracts', label: $LL.common.nav.contracts(), content: contracts }]}
/>

{#if tenant}
	<TenantForm
		open={isTenantFormOpen}
		onOpenChange={(isOpen) => {
			isTenantFormOpen = isOpen;
		}}
		value={formOpensOn}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		record={tenant.name}
		blockers={tenantBlockers}
		onSubmit={deleteTenant}
	/>
{/if}
