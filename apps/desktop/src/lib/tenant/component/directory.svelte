<script lang="ts">
	import { DirectoryImportDialog } from '$lib/transfer/ui';
	import { List } from '$lib/list/ui';
	import { RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import SelectionDialog from '@rentable/design/block/selection-dialog.svelte';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionPlan
	} from '@rentable/design/selection.js';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import TenantCard, {
		contractCounts,
		TENANT_TILE_HEIGHT,
		type TenantRecord
	} from '$lib/tenant/component/card.svelte';
	import { toNarrowedName } from '@rentable/design/csv.js';
	import { toCardActions } from '$lib/act';
	import { tenantActs, tenantHost } from '$lib/tenant/host.svelte';
	import {
		useDeleteManyTenants,
		useListTenants,
		usePlanManyTenants,
		type TenantRefusalReason
	} from '$lib/tenant/query';
	import { TENANT_SORT_COLUMN_IDS, type TenantSortColumnId } from '$lib/tenant/tenant';
	import { useImportRecords } from '$lib/workspace/ui';
	import { toTransferInput } from '$lib/transfer';
	import { IMPORT_FLAGS, memberPermissions } from '$lib/permission';
	import { contributionsTo } from '$lib/feature/surface';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	// what a card says of the contracts naming the tenant is the contract's to decide, and it
	// contributes it: the order the chips stand in, and whether the reader may see them.
	const contracts = contributionsTo('tenant');

	// the counts are offered as an order and a column of the file only to a reader shown them.
	const viewsContract = $derived(contracts.viewsContracts());

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);
	// the records the reader has picked out, and the set a control was reached for with. The two
	// are separate because the selection stays live behind the confirmation, and an action that
	// read it again at submit time would act on whatever it had become.
	let selected = $state<string[]>([]);
	let confirming = $state<string[] | null>(null);

	const tenantsQuery = useListTenants(
		() => search,
		() => sort
	);
	const tenants = $derived(tenantsQuery.data ?? []);
	const deleteManyMutation = useDeleteManyTenants();
	const importMutation = useImportRecords();

	const planQuery = usePlanManyTenants(() => confirming ?? []);

	// what the deletion would do, as the shared confirmation states it. `null` while the plan is
	// still being read, which is what puts that dialog in its waiting state.
	const plan = $derived.by((): SelectionPlan | null =>
		// handed on unchanged: the procedure answers in the shared vocabulary already, and the
		// annotation is what holds it to that.
		confirming && planQuery.data ? planQuery.data : null
	);

	// the reasons a deletion can turn a tenant away for, in the order they are worth reading: the
	// rule the action is about first, and *gone from under you* last, because it is the one
	// nothing the reader did caused.
	const REFUSAL_ORDER = [
		'holds-contracts',
		'missing'
	] as const satisfies readonly TenantRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'holds-contracts': (count: number) => $LL.tenants.selection.refusedHoldsContracts({ count }),
			missing: (count: number) => $LL.tenants.selection.refusedMissing({ count })
		} satisfies Record<TenantRefusalReason, (count: number) => string>)
	);

	/**
	 * Delete the set the reader agreed to.
	 *
	 * Nothing is announced here. The declaration behind the call says how many went through, and
	 * says what the workspace turned away after the confirmation was drawn, both through the shared
	 * handlers, which is where every announcement in this application is raised from.
	 */
	async function deleteSelected() {
		if (!confirming) {
			return;
		}

		await deleteManyMutation.mutateAsync({ ids: confirming, foreseen: foreseenRefusals(plan) });
		// the selection is put down, and the dialog closes itself once this resolves: unmounting it
		// from here would take it off screen mid-close.
		selected = [];
	}

	// built from the ids the procedure orders by, so the control cannot come to offer a key
	// the query would reject. The record type is what makes a missing label a type error.
	const sortOptions = $derived.by(() => {
		const labels: Record<TenantSortColumnId, string> = {
			name: $LL.common.labels.name(),
			nationalId: $LL.common.labels.nationalId(),
			activeContractCount: $LL.common.labels.activeContracts()
		};

		return TENANT_SORT_COLUMN_IDS.filter((id) => id !== 'activeContractCount' || viewsContract).map(
			(id) => ({ id, label: labels[id] })
		);
	});
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same control a record's own menu wears, so a deletion means the same thing and looks
	     the same whether it is aimed at one tenant or at nine. Delete and nothing else: it is the
	     only thing a tenant admits being done to several at a time. -->
	<RecordActionControl
		label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count: ids.length })}`}
		icon={Trash2Icon}
		tone="error"
		unavailable={memberPermissions.refusal('deleteTenant', $LL)}
		onclick={() => (confirming = [...ids])}
	/>
{/snippet}

<List
	data={tenants}
	bind:search
	bind:sort
	{sortOptions}
	bind:selected
	{selectionActions}
	isLoading={tenantsQuery.isLoading}
	isFetching={tenantsQuery.isFetching}
	recordMinWidth={RECORD_TILE_MIN_WIDTH}
	recordHeight={TENANT_TILE_HEIGHT}
	exportAs={{
		name: toNarrowedName($LL.common.nav.tenants(), [search]),
		columns: [
			{ header: $LL.common.labels.name(), value: (tenant) => tenant.name },
			{ header: $LL.common.labels.nationalId(), value: (tenant) => tenant.nationalId },
			{ header: $LL.common.labels.phone(), value: (tenant) => tenant.phone },
			// the export follows the card: a reader exports what they are looking at, and a file
			// short of a figure that is on screen is the defect the complexes export already has.
			// Every status is a column, zeros included, where the card leaves a zero out: a column
			// has to be there on every line to be a column.
			//
			// The counts cross as counts. Rendered through the locale they were text, and a column
			// of text is a column nothing can total — which is the first thing anyone does to a
			// directory of tenants in a spreadsheet.
			...(viewsContract ? contracts.attentionOrder : []).map((status) => ({
				header: $LL.common.status[status](),
				value: (tenant: TenantRecord) => contractCounts(tenant)?.[status] ?? 0
			}))
		]
	}}
	onImport={() => void importDialog?.choose()}
	importUnavailable={memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL)}
	onCreate={() => tenantHost.create()}
	createLabel={$LL.common.actions.newTenant()}
	createUnavailable={memberPermissions.refusal('createTenant', $LL)}
	emptyTitle={$LL.tenants.empty.title()}
	emptyDescription={$LL.tenants.empty.description()}
>
	{#snippet record(tenant: TenantRecord)}
		<TenantCard
			{tenant}
			actions={toCardActions(tenantActs, tenant, $LL)}
			statuses={contracts.attentionOrder}
		/>
	{/snippet}
</List>

{#if confirming}
	{@const count = confirming.length}
	<SelectionDialog
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				confirming = null;
			}
		}}
		title={$LL.tenants.selection.deleteTitle()}
		selected={$LL.common.table.recordsSelected({ count })}
		{plan}
		reasons={REFUSAL_ORDER}
		{describeReason}
		summarize={(eligible) => $LL.tenants.selection.deleteSummary({ count: eligible })}
		confirmLabel={$LL.common.actions.delete()}
		confirmLoadingLabel={$LL.common.actions.deleting()}
		onSubmit={deleteSelected}
	/>
{/if}

<!-- the file the export wrote, coming back in. What a file of tenants is — which columns, what
     makes a row valid, what already exists — is declared once for the whole transfer and read
     from there rather than restated here: a tenant named in a file of tenants and one named by a
     contract are the same national id, and two places deciding what that means is two places for
     them to disagree. -->
<DirectoryImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.tenants() })}
	concept="tenants"
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
