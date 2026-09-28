<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '@rentable/design/back.svelte.js';
	import type api from '$lib/api/caller';
	import { UNIT_SORT_COLUMN_IDS, type UnitSortColumnId } from '$lib/complex/complex';
	import {
		useDeleteManyUnits,
		useListUnits,
		usePlanManyUnits,
		type UnitRefusalReason
	} from '$lib/complex/query';
	import { unitActs, unitHost } from '$lib/complex/unit/host.svelte';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import SelectionDialog from '@rentable/design/block/selection-dialog.svelte';
	import { toCardActions } from '$lib/design/acts';
	import List from '$lib/design/block/list.svelte';
	import { toNarrowedName } from '@rentable/design/csv.js';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionPlan
	} from '@rentable/design/selection.js';
	import * as Cell from '$lib/design/cell';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import { IMPORT_FLAGS, memberPermissions } from '$lib/workspace/permission';
	import UserIcon from '@lucide/svelte/icons/user';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	type UnitRecord = Awaited<ReturnType<typeof api.complex.units.getMany>>[number];

	let {
		complexId,
		/** what the complex is called, so a file of its units can say which building it is. */
		complexName
	}: { complexId: string; complexName: string } = $props();

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);
	// the records the reader has picked out, and the set a control was reached for with. The two
	// are separate because the selection stays live behind the confirmation, and an action that
	// read it again at submit time would act on whatever it had become.
	let selected = $state<string[]>([]);
	let confirming = $state<string[] | null>(null);

	const unitsQuery = useListUnits(
		() => complexId,
		() => search,
		() => sort
	);
	const units = $derived(unitsQuery.data ?? []);
	const deleteManyMutation = useDeleteManyUnits();
	const importMutation = useImportRecords();

	const planQuery = usePlanManyUnits(() => confirming ?? []);

	// what the deletion would do, as the shared confirmation states it. `null` while the plan is
	// still being read, which is what puts that dialog in its waiting state.
	//
	// This is the list the plan query exists for: a unit's row shows the status it has today, and
	// a unit is refused for every contract that ever mentioned it, so a row reading *vacant* says
	// nothing about whether it can go.
	const plan = $derived.by((): SelectionPlan | null =>
		confirming && planQuery.data ? planQuery.data : null
	);

	const REFUSAL_ORDER = [
		'holds-contracts',
		'missing'
	] as const satisfies readonly UnitRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'holds-contracts': (count: number) =>
				$LL.complexes.selection.unitRefusedHoldsContracts({ count }),
			missing: (count: number) => $LL.complexes.selection.unitRefusedMissing({ count })
		} satisfies Record<UnitRefusalReason, (count: number) => string>)
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

		const result = await deleteManyMutation.mutateAsync({
			ids: confirming,
			foreseen: foreseenRefusals(plan)
		});

		// a deleted unit's own page may be behind the reader, and it is not somewhere back can
		// return to now. The single-record deletion does this for the one record it removed; a
		// selection does it for every record it removed.
		for (const removed of result.deleted) {
			back.forget(resolve(`/complexes/units/${removed.id}`));
		}

		// the selection is put down, and the dialog closes itself once this resolves: unmounting it
		// from here would take it off screen mid-close.
		selected = [];
	}

	// the occupant is offered as an order and a column of the file only to a reader who may view
	// tenants: the list answers anyone else with no occupant (effort 838, requirement 10).
	const viewsTenant = $derived(memberPermissions.views('tenant'));

	// what a unit's card offers, projected from the one list its own page and the command menu read
	// (`complex/unit/acts.ts`). The row is handed over with the complex this directory lists, which
	// is what a unit's details name it by.
	const cardActions = (record: UnitRecord) =>
		toCardActions(unitActs, { ...record, complexName }, $LL);

	// built from the ids the procedure orders by, so the control cannot come to offer a key the
	// query would reject: what a card shows, and nothing it does not.
	const sortOptions = $derived.by(() => {
		const labels: Record<UnitSortColumnId, string> = {
			name: $LL.common.labels.name(),
			tenantName: $LL.common.labels.tenant(),
			status: $LL.common.labels.status()
		};

		return UNIT_SORT_COLUMN_IDS.filter((id) => id !== 'tenantName' || viewsTenant).map((id) => ({
			id,
			label: labels[id]
		}));
	});
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same control a record's own menu wears, so a deletion means the same thing and looks
	     the same whether it is aimed at one unit or at nine. Delete and nothing else: it is the
	     only thing a unit admits being done to several at a time. -->
	<RecordActionControl
		label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count: ids.length })}`}
		icon={Trash2Icon}
		tone="error"
		unavailable={memberPermissions.refusal('deleteUnit', $LL)}
		onclick={() => (confirming = [...ids])}
	/>
{/snippet}

<List
	data={units}
	bind:search
	bind:sort
	{sortOptions}
	bind:selected
	{selectionActions}
	isLoading={unitsQuery.isLoading}
	isFetching={unitsQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	exportAs={{
		// the complex is in the name rather than its id: every complex has a units directory, one
		// file name between them would have each export replace the last silently, and a reader
		// looking at the file a week later can tell which complex it is about.
		name: toNarrowedName(`${$LL.common.nav.units()} — ${complexName}`, [search]),
		columns: [
			// the complex leads, because a file of units that never names the complex holding
			// them is a file that cannot be read away from the screen it came off.
			{ header: $LL.common.labels.complex(), value: () => complexName },
			{ header: $LL.common.labels.name(), value: (unit) => unit.name },
			{ header: $LL.common.labels.status(), value: (unit) => $LL.common.status[unit.status]() },
			...(viewsTenant
				? [
						{
							header: $LL.common.labels.tenant(),
							value: (unit: UnitRecord) => unit.tenantName ?? ''
						}
					]
				: [])
		]
	}}
	onImport={() => void importDialog?.choose()}
	importUnavailable={memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL)}
	onCreate={() => unitHost.create({ complexId })}
	createLabel={$LL.common.actions.newUnit()}
	createUnavailable={memberPermissions.refusal('createUnit', $LL)}
	emptyTitle={$LL.complexes.units.emptyTitle()}
	emptyDescription={$LL.complexes.units.emptyDescription()}
>
	{#snippet record(record: UnitRecord)}
		<RecordCard
			href={resolve(`/complexes/units/${record.id}`)}
			label={record.name}
			actions={cardActions(record)}
		>
			{#snippet content()}
				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<Cell.Text class="truncate text-sm font-medium" text={record.name} />
					<!-- who is in it, which is the question the board this replaced existed to answer. A
					     reader who may not view tenants is answered with no occupant at all, and the line
					     is left out rather than reading as vacant (effort 838, requirement 10). -->
					{#if 'tenantName' in record}
						<span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
							{#if record.tenantName}
								<UserIcon class="size-3.5 shrink-0" aria-hidden="true" />
								<Cell.Text class="truncate" text={record.tenantName} />
							{:else}
								<span class="truncate">{$LL.common.status.vacant()}</span>
							{/if}
						</span>
					{/if}
				</span>

				<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
					<Cell.Status status={record.status} />
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
		title={$LL.complexes.selection.unitDeleteTitle()}
		selected={$LL.common.table.recordsSelected({ count })}
		{plan}
		reasons={REFUSAL_ORDER}
		{describeReason}
		summarize={(eligible) => $LL.complexes.selection.unitDeleteSummary({ count: eligible })}
		confirmLabel={$LL.common.actions.delete()}
		confirmLoadingLabel={$LL.common.actions.deleting()}
		onSubmit={deleteSelected}
	/>
{/if}

<!-- a file of units names the complex each unit is in, and that name is what decides where the
     unit lands — not this screen. The two are the same complex whenever the file came off this
     list, and where they are not, the file is right: a row naming a complex the workspace does
     not hold is turned away with the name it could not find, and the rest of the file still goes
     in. -->
<DirectoryImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.units() })}
	concept="units"
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
