<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import ImportDialog from '$lib/design/block/import-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import * as Cell from '$lib/design/cell';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import type { ListSort } from '$lib/design/sort';
	import { LL } from '$lib/i18n/i18n-svelte';
	import api from '$lib/api/caller';
	import { toNarrowedName } from '$lib/design/csv';
	import { toImportIdentity, type ImportField } from '$lib/design/import';
	import { useDeleteTenant, useImportTenants, useListTenants } from '$lib/tenant/query';
	import {
		identity,
		isTenantDeletable,
		phone,
		TENANT_SORT_COLUMN_IDS,
		type TenantSortColumnId
	} from '$lib/tenant/tenant';
	import { useListContracts } from '$lib/contract/query';
	import { CONTRACT_ATTENTION_ORDER } from '$lib/contract/contract';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TenantForm from './form.svelte';

	type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	/** the three columns a file of tenants is read into, before any of it is a tenant. */
	type ImportedTenant = { name: string; nationalId: string; phone: string };

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
	let importDialog = $state<ReturnType<typeof ImportDialog> | undefined>(undefined);

	const tenantsQuery = useListTenants(
		() => search,
		() => sort
	);
	const tenants = $derived(tenantsQuery.data ?? []);
	const deleteMutation = useDeleteTenant();
	const importMutation = useImportTenants();

	// what a tenant is made of, in every language a file of them may have been exported in — the
	// same three labels the export writes, read back through whichever one the file carries.
	//
	// The counts the export also writes are not here: they are what the tenant's contracts add up
	// to rather than anything a tenant holds, so a file carrying them imports as a file of
	// tenants and the columns are ignored.
	const importFields = $derived<readonly ImportField<ImportedTenant>[]>([
		{
			id: 'name',
			headers: [$LL.common.labels.name(), 'name', 'الاسم'],
			required: true
		},
		{
			id: 'nationalId',
			headers: [$LL.common.labels.nationalId(), 'national id', 'الهوية الوطنية'],
			required: true,
			identity: true
		},
		{
			id: 'phone',
			headers: [$LL.common.labels.phone(), 'phone', 'الهاتف'],
			required: true,
			identity: true
		}
	]);

	// the domain's own patterns, asked here rather than restated: the router refuses the same
	// rows, and a preview promising a write the boundary would reject is worse than no preview.
	const validateImported = (record: ImportedTenant) => {
		if (!identity.test(record.nationalId)) {
			return $LL.tenants.form.invalidNationalId();
		}

		// the country code is the one the pattern accepts, and a file carries the whole number
		// rather than the two halves the form splits it into.
		return phone.test(record.phone)
			? undefined
			: $LL.tenants.form.invalidPhone({ countryCode: '+966' });
	};

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

<List
	data={tenants}
	bind:search
	bind:sort
	{sortOptions}
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

<!-- the file the export wrote, coming back in. Mounted here rather than inside the list because
     what a file of tenants is — which columns, what makes a row valid, what already exists — is
     the concept's, and the shell only says that the direction is offered. -->
<ImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.tenants() })}
	fields={importFields}
	validate={validateImported}
	existingIdentities={async () => {
		const held = await api.tenant.identities();

		return new Set(held.map((values) => toImportIdentity(values)));
	}}
	onConfirm={async (records) => {
		await importMutation.mutateAsync(records);
	}}
/>
