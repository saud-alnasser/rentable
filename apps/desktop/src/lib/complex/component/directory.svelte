<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import {
		COMPLEX_SORT_COLUMN_IDS,
		isComplexDeletable,
		type ComplexSortColumnId
	} from '$lib/complex/complex';
	import {
		useDeleteComplex,
		useDeleteManyComplexes,
		useFetchUnits,
		useListComplexes,
		usePlanManyComplexes,
		type ComplexRefusalReason
	} from '$lib/complex/query';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import { toNarrowedName } from '$lib/design/csv';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import SelectionDialog from '$lib/design/block/selection-dialog.svelte';
	import * as Cell from '$lib/design/cell';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import type { SelectionPlan } from '$lib/design/selection';
	import type { ListSort } from '$lib/design/sort';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import CircleDashedIcon from '@tabler/icons-svelte/icons/circle-dashed';
	import CircleFilledIcon from '@tabler/icons-svelte/icons/circle-filled';
	import LayoutGridIcon from '@tabler/icons-svelte/icons/layout-grid';
	import ComplexForm from './form.svelte';

	type ComplexRecord = Awaited<ReturnType<typeof api.complex.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let isComplexFormOpen = $state(false);
	let formOpensOn = $state<ComplexRecord | undefined>(undefined);
	// the one record a card's menu is acting on, which is what makes a single confirmation and a
	// single read of what blocks it enough for a whole directory.
	let deleteOpensOn = $state<ComplexRecord | null>(null);
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
	const deleteMutation = useDeleteComplex();
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

	// the reasons a deletion can turn a complex away for, in the order they are worth reading: the
	// rule the action is about first, and *gone from under you* last, because it is the one
	// nothing the reader did caused.
	const REFUSAL_ORDER = [
		'holds-units',
		'missing'
	] as const satisfies readonly ComplexRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words.
	const refusalLabels = $derived({
		'holds-units': (count: number) => $LL.complexes.selection.refusedHoldsUnits({ count }),
		missing: (count: number) => $LL.complexes.selection.refusedMissing({ count })
	} satisfies Record<ComplexRefusalReason, (count: number) => string>);

	function describeReason(reason: string, count: number) {
		// the shared confirmation is deliberately ignorant of any concept's reasons, so it hands
		// this one back as a plain string. The map above is what keeps the lookup total.
		const label = refusalLabels[reason as ComplexRefusalReason];

		return label ? label(count) : $LL.complexes.selection.refusedMissing({ count });
	}

	// what a deletion would be refused for, read for the record being acted on and only while it
	// is being acted on. The row carries a unit count, and the rule is the domain's to apply —
	// judging it on the figure here would state the same rule a second time, outside the module
	// that owns it.
	const heldUnitsQuery = useFetchUnits(
		() => deleteOpensOn?.id ?? '',
		() => deleteOpensOn !== null
	);
	const deleteBlockers = $derived.by(() => {
		if (!deleteOpensOn) {
			return [];
		}

		if (heldUnitsQuery.isPending) {
			return AWAITING_BLOCKERS;
		}

		const held = heldUnitsQuery.data ?? [];

		return isComplexDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedUnits({ count: held.length })];
	});

	// what the record's own page offers, minus opening it. No duplicate: a complex is its name and
	// its location, both unique to it, so the copy would carry nothing.
	const cardActions = (complex: ComplexRecord): RecordCardAction[] => [
		{
			label: $LL.common.actions.edit(),
			icon: SquarePenIcon,
			onSelect: () => {
				formOpensOn = complex;
				isComplexFormOpen = true;
			}
		},
		{
			label: $LL.common.actions.delete(),
			icon: Trash2Icon,
			variant: 'destructive',
			onSelect: () => {
				deleteOpensOn = complex;
			}
		}
	];

	async function deleteComplex() {
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
		const labels: Record<ComplexSortColumnId, string> = {
			name: $LL.common.labels.name(),
			location: $LL.common.labels.location(),
			unitCount: $LL.common.labels.units(),
			vacantUnitCount: $LL.common.labels.vacantUnits()
		};

		return COMPLEX_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		formOpensOn = undefined;
		isComplexFormOpen = true;
		void goto(resolve('/complexes'), { replaceState: true, noScroll: true, keepFocus: true });
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
	recordHeight={ROW_HEIGHT}
	exportAs={{
		name: toNarrowedName($LL.common.nav.complexes(), [search]),
		columns: [
			{ header: $LL.common.labels.name(), value: (complex) => complex.name },
			{ header: $LL.common.labels.location(), value: (complex) => complex.location },
			{ header: $LL.common.labels.units(), value: (complex) => complex.unitCount },
			// the three figures the row shows, in the order it shows them. Occupancy is not on the
			// query — a unit is occupied or vacant, so the third figure is the other two — which is
			// why it has to be derived here as well rather than read off the record.
			{
				header: $LL.common.labels.occupiedUnits(),
				value: (complex) => complex.unitCount - complex.vacantUnitCount
			},
			{ header: $LL.common.labels.vacantUnits(), value: (complex) => complex.vacantUnitCount }
		]
	}}
	onImport={() => void importDialog?.choose()}
	onCreate={() => {
		formOpensOn = undefined;
		isComplexFormOpen = true;
	}}
>
	{#snippet record(complex: ComplexRecord)}
		<!-- occupancy is not on the query: a unit is occupied or vacant, so the third figure is
		     the other two. -->
		{@const occupiedUnitCount = complex.unitCount - complex.vacantUnitCount}
		<RecordCard
			href={resolve(`/complexes/${complex.id}`)}
			label={complex.name}
			actions={cardActions(complex)}
			class="gap-4"
		>
			{#snippet content()}
				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<span class="truncate text-sm font-medium">{complex.name}</span>
					<span class="truncate text-xs text-muted-foreground">{complex.location}</span>
				</span>

				<span class="pointer-events-none relative flex shrink-0 items-center gap-4">
					<Cell.Count
						icon={LayoutGridIcon}
						count={complex.unitCount}
						label={$LL.common.labels.units()}
					/>

					<Cell.Count
						icon={CircleFilledIcon}
						count={occupiedUnitCount}
						label={$LL.common.labels.occupiedUnits()}
						tone={occupiedUnitCount > 0 ? 'running' : 'settled'}
					/>

					<Cell.Count
						icon={CircleDashedIcon}
						count={complex.vacantUnitCount}
						label={$LL.common.labels.vacantUnits()}
					/>
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
		title={$LL.complexes.selection.deleteTitle()}
		selected={$LL.common.table.recordsSelected({ count })}
		{plan}
		reasons={REFUSAL_ORDER}
		{describeReason}
		summarize={(eligible) => $LL.complexes.selection.deleteSummary({ count: eligible })}
		confirmLabel={$LL.common.actions.delete()}
		confirmLoadingLabel={$LL.common.actions.deleting()}
		onSubmit={deleteSelected}
	/>
{/if}

<ComplexForm
	open={isComplexFormOpen}
	onOpenChange={(isOpen) => {
		isComplexFormOpen = isOpen;
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
	onSubmit={deleteComplex}
/>

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
