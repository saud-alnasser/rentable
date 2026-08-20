<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import SelectionDialog from '$lib/design/block/selection-dialog.svelte';
	import * as Cell from '$lib/design/cell';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import type { SelectionPlan } from '$lib/design/selection';
	import type { ListSort } from '$lib/design/sort';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type api from '$lib/api/caller';
	import { toNarrowedName } from '$lib/design/csv';
	import {
		useDeleteManyTenants,
		useDeleteTenant,
		useListTenants,
		usePlanManyTenants,
		type TenantRefusalReason
	} from '$lib/tenant/query';
	import {
		isTenantDeletable,
		TENANT_SORT_COLUMN_IDS,
		type TenantSortColumnId
	} from '$lib/tenant/tenant';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import { useListContracts } from '$lib/contract/query';
	import { CONTRACT_ATTENTION_ORDER } from '$lib/contract/contract';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TenantForm from './form.svelte';

	type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	// the row's six figures, keyed by the status each counts.
	//
	// The query answers with one field per status rather than a nested figure, so this is where
	// the two shapes meet — and it is a function of the record rather than a derived value
	// because the list hands each row to the snippet one at a time.
	const contractCounts = (tenant: TenantRecord) => ({
		scheduled: tenant.contractsScheduled,
		active: tenant.contractsActive,
		fulfilled: tenant.contractsFulfilled,
		defaulted: tenant.contractsDefaulted,
		expired: tenant.contractsExpired,
		terminated: tenant.contractsTerminated
	});

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let isTenantFormOpen = $state(false);
	let formOpensOn = $state<TenantRecord | undefined>(undefined);
	// the one record a card's menu is acting on, which is what makes a single confirmation and a
	// single read of what blocks it enough for a whole directory.
	let deleteOpensOn = $state<TenantRecord | null>(null);
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
	const deleteMutation = useDeleteTenant();
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
	// is shown under somebody else's words.
	const refusalLabels = $derived({
		'holds-contracts': (count: number) => $LL.tenants.selection.refusedHoldsContracts({ count }),
		missing: (count: number) => $LL.tenants.selection.refusedMissing({ count })
	} satisfies Record<TenantRefusalReason, (count: number) => string>);

	function describeReason(reason: string, count: number) {
		// the shared confirmation is deliberately ignorant of any concept's reasons, so it hands
		// this one back as a plain string. The map above is what keeps the lookup total.
		const label = refusalLabels[reason as TenantRefusalReason];

		return label ? label(count) : $LL.tenants.selection.refusedMissing({ count });
	}

	// what a deletion would be refused for, read for the record being acted on and only while it
	// is being acted on — the same reading the record's own page performs before asking.
	const heldContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ tenantId: deleteOpensOn?.id }),
		() => deleteOpensOn !== null
	);
	const deleteBlockers = $derived.by(() => {
		if (!deleteOpensOn) {
			return [];
		}

		// the list query hands back the previous scope's rows while the new scope loads, so a
		// second card would otherwise be judged on what the first one held.
		if (heldContractsQuery.isPending || heldContractsQuery.isPlaceholderData) {
			return AWAITING_BLOCKERS;
		}

		const held = heldContractsQuery.data ?? [];

		return isTenantDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedContracts({ count: held.length })];
	});

	// what the record's own page offers, minus opening it: a tenant is identified by fields that
	// are unique to it, so there is nothing worth duplicating, and copying its details takes the
	// fields in the order that page reads them rather than the order a card does.
	const cardActions = (tenant: TenantRecord): RecordCardAction[] => [
		{
			label: $LL.common.actions.edit(),
			icon: SquarePenIcon,
			onSelect: () => {
				formOpensOn = tenant;
				isTenantFormOpen = true;
			}
		},
		{
			label: $LL.common.actions.delete(),
			icon: Trash2Icon,
			variant: 'destructive',
			onSelect: () => {
				deleteOpensOn = tenant;
			}
		}
	];

	async function deleteTenant() {
		if (!deleteOpensOn) {
			return;
		}

		await deleteMutation.mutateAsync(deleteOpensOn.id);
		deleteOpensOn = null;
	}

	/**
	 * Delete the set the reader agreed to.
	 *
	 * How many went through is not announced here: the declaration behind the call says it through
	 * the shared handler, which is where every announcement in this application is raised from.
	 */
	async function deleteSelected() {
		if (!confirming) {
			return;
		}

		await deleteManyMutation.mutateAsync(confirming);
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

		return TENANT_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		formOpensOn = undefined;
		isTenantFormOpen = true;
		void goto(resolve('/tenants'), { replaceState: true, noScroll: true, keepFocus: true });
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
	recordHeight={ROW_HEIGHT}
	exportAs={{
		name: toNarrowedName($LL.common.nav.tenants(), [search]),
		columns: [
			{ header: $LL.common.labels.name(), value: (tenant) => tenant.name },
			{ header: $LL.common.labels.nationalId(), value: (tenant) => tenant.nationalId },
			{ header: $LL.common.labels.phone(), value: (tenant) => tenant.phone },
			// the export follows the row, because the columns are the row's: a reader exports what
			// they are looking at, and a file short of a figure that is on screen is the defect the
			// complexes export already has.
			//
			// The counts cross as counts. Rendered through the locale they were text, and a column
			// of text is a column nothing can total — which is the first thing anyone does to a
			// directory of tenants in a spreadsheet.
			...CONTRACT_ATTENTION_ORDER.map((status) => ({
				header: $LL.common.status[status](),
				value: (tenant: TenantRecord) => contractCounts(tenant)[status]
			}))
		]
	}}
	onImport={() => void importDialog?.choose()}
	onCreate={() => {
		formOpensOn = undefined;
		isTenantFormOpen = true;
	}}
>
	{#snippet record(tenant: TenantRecord)}
		{@const counts = contractCounts(tenant)}
		<RecordCard
			href={resolve(`/tenants/${tenant.id}`)}
			label={tenant.name}
			actions={cardActions(tenant)}
			class="gap-4"
		>
			{#snippet content()}
				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<span class="truncate text-sm font-medium">{tenant.name}</span>
					<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
						<span class="truncate tabular-nums">{tenant.nationalId}</span>
						<span aria-hidden="true">&middot;</span>
						<Cell.Phone phone={tenant.phone} />
					</span>
				</span>

				<!-- a figure per status, in the order the contracts directory ranks them: what needs the
				     reader, then what is running, then what has not started, then the history behind
				     them. Every status is shown including the ones at zero, so the six form fixed
				     columns down the list — a cluster that varied with what each tenant happened to
				     hold would work against exactly that. -->
				<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
					{#each CONTRACT_ATTENTION_ORDER as status (status)}
						<Cell.StatusCount {status} count={counts[status]} />
					{/each}
				</span>
			{/snippet}
		</RecordCard>
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

<TenantForm
	open={isTenantFormOpen}
	onOpenChange={(isOpen) => {
		isTenantFormOpen = isOpen;
	}}
	value={formOpensOn}
/>

<DeleteDialog
	open={deleteOpensOn !== null}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			deleteOpensOn = null;
		}
	}}
	record={deleteOpensOn?.name}
	blockers={deleteBlockers}
	onSubmit={deleteTenant}
/>

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
