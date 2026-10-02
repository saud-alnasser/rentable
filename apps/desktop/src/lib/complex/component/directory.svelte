<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
	import { complexActs, complexHost } from '$lib/complex/host.svelte';
	import {
		useDeleteManyComplexes,
		useListComplexes,
		usePlanManyComplexes,
		type ComplexRefusalReason
	} from '$lib/complex/query';
	import { RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import { List } from '$lib/list/ui';
	import ComplexCard, { COMPLEX_TILE_HEIGHT } from '$lib/complex/component/card.svelte';
	import { toNarrowedName } from '@rentable/design/csv.js';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import SelectionDialog from '@rentable/design/block/selection-dialog.svelte';
	import { toCardActions } from '$lib/act';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionPlan
	} from '@rentable/design/selection.js';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { DirectoryImportDialog } from '$lib/transfer/ui';
	import { useImportRecords } from '$lib/workspace/ui';
	import { toTransferInput } from '$lib/transfer';
	import { IMPORT_FLAGS, memberPermissions } from '$lib/permission';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	type ComplexRecord = Awaited<ReturnType<typeof api.complex.getMany>>[number];

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);
	// the records the reader has picked out, and the set a control was reached for with. The two
	// are separate because the selection stays live behind the confirmation, and an action that
	// read it again at submit time would act on whatever it had become.
	let selected = $state<string[]>([]);
	let confirming = $state<string[] | null>(null);

	const complexesQuery = useListComplexes(
		() => search,
		() => sort
	);
	const complexes = $derived(complexesQuery.data ?? []);
	const deleteManyMutation = useDeleteManyComplexes();
	const importMutation = useImportRecords();

	const planQuery = usePlanManyComplexes(() => confirming ?? []);

	// what the deletion would do, as the shared confirmation states it. `null` while the plan is
	// still being read, which is what puts that dialog in its waiting state.
	const plan = $derived.by((): SelectionPlan | null =>
		// handed on unchanged: the procedure answers in the shared vocabulary already, and the
		// annotation is what holds it to that.
		confirming && planQuery.data ? planQuery.data : null
	);

	// how many units go with the complexes the deletion would take, which the summary names beside
	// them, since they are deleted too.
	const unitsGoing = $derived(confirming && planQuery.data ? planQuery.data.units : 0);

	// the reasons a deletion can turn a complex away for, in the order they are worth reading: the
	// rule the action is about first, and *gone from under you* last, because it is the one
	// nothing the reader did caused.
	const REFUSAL_ORDER = [
		'units-under-contract',
		'deletes-units',
		'missing'
	] as const satisfies readonly ComplexRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'units-under-contract': (count: number) =>
				$LL.complexes.selection.refusedUnitsUnderContract({ count }),
			'deletes-units': (count: number) => $LL.complexes.selection.refusedDeletesUnits({ count }),
			missing: (count: number) => $LL.complexes.selection.refusedMissing({ count })
		} satisfies Record<ComplexRefusalReason, (count: number) => string>)
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

	// the unit figures are offered as orders and columns of the file only to a reader who may view
	// units: the list answers anyone else with none (effort 838, requirement 10).
	const viewsUnit = $derived(memberPermissions.views('unit'));

	// built from the ids the procedure orders by, so the control cannot come to offer a key
	// the query would reject. The record type is what makes a missing label a type error.
	const sortOptions = $derived.by(() => {
		const labels: Record<ComplexSortColumnId, string> = {
			name: $LL.common.labels.name(),
			location: $LL.common.labels.location(),
			unitCount: $LL.common.labels.units(),
			vacantUnitCount: $LL.common.labels.vacantUnits()
		};

		return COMPLEX_SORT_COLUMN_IDS.filter(
			(id) => viewsUnit || (id !== 'unitCount' && id !== 'vacantUnitCount')
		).map((id) => ({ id, label: labels[id] }));
	});
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same control a record's own menu wears, so a deletion means the same thing and looks
	     the same whether it is aimed at one complex or at nine. Delete and nothing else: it is the
	     only thing a complex admits being done to several at a time. -->
	<RecordActionControl
		label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count: ids.length })}`}
		icon={Trash2Icon}
		tone="error"
		unavailable={memberPermissions.refusal('deleteComplex', $LL)}
		onclick={() => (confirming = [...ids])}
	/>
{/snippet}

<List
	data={complexes}
	bind:search
	bind:sort
	{sortOptions}
	bind:selected
	{selectionActions}
	isLoading={complexesQuery.isLoading}
	isFetching={complexesQuery.isFetching}
	recordMinWidth={RECORD_TILE_MIN_WIDTH}
	recordHeight={COMPLEX_TILE_HEIGHT}
	exportAs={{
		name: toNarrowedName($LL.common.nav.complexes(), [search]),
		columns: [
			{ header: $LL.common.labels.name(), value: (complex) => complex.name },
			{ header: $LL.common.labels.location(), value: (complex) => complex.location },
			// the three figures the row shows, in the order it shows them. Occupancy is not on the
			// query — a unit is occupied or vacant, so the third figure is the other two — which is
			// why it has to be derived here as well rather than read off the record.
			...(viewsUnit
				? [
						{
							header: $LL.common.labels.units(),
							value: (complex: ComplexRecord) => complex.unitCount ?? 0
						},
						{
							header: $LL.common.labels.occupiedUnits(),
							value: (complex: ComplexRecord) =>
								(complex.unitCount ?? 0) - (complex.vacantUnitCount ?? 0)
						},
						{
							header: $LL.common.labels.vacantUnits(),
							value: (complex: ComplexRecord) => complex.vacantUnitCount ?? 0
						}
					]
				: [])
		]
	}}
	onImport={() => void importDialog?.choose()}
	importUnavailable={memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL)}
	onCreate={() => complexHost.create()}
	createLabel={$LL.common.actions.newComplex()}
	createUnavailable={memberPermissions.refusal('createComplex', $LL)}
	emptyTitle={$LL.complexes.empty.title()}
	emptyDescription={$LL.complexes.empty.description()}
>
	{#snippet record(complex: ComplexRecord)}
		<!-- a tile in the grid (requirement 18 of effort 846): what it holds is the card's. -->
		<ComplexCard
			{complex}
			href={resolve(`/complexes/${complex.id}`)}
			actions={toCardActions(complexActs, complex, $LL)}
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
		title={$LL.complexes.selection.deleteTitle()}
		selected={$LL.common.table.recordsSelected({ count })}
		{plan}
		reasons={REFUSAL_ORDER}
		{describeReason}
		summarize={(eligible) =>
			unitsGoing > 0
				? $LL.complexes.selection.deleteSummaryWithUnits({ count: eligible, units: unitsGoing })
				: $LL.complexes.selection.deleteSummary({ count: eligible })}
		confirmLabel={$LL.common.actions.delete()}
		confirmLoadingLabel={$LL.common.actions.deleting()}
		onSubmit={deleteSelected}
	/>
{/if}

<!-- the file the export wrote, coming back in. What a file of complexes is — which columns, what
     makes two rows one record — is declared once for the whole transfer and read from there
     rather than restated here: a complex named in a file of units and a complex named in a file
     of complexes are the same name, and two places deciding what it means is two places for them
     to disagree. -->
<DirectoryImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.complexes() })}
	concept="complexes"
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
