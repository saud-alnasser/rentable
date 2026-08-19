<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '$lib/design/back.svelte';
	import type api from '$lib/api/caller';
	import { useDeleteUnit, useListUnits } from '$lib/complex/query';
	import { useListContracts } from '$lib/contract/query';
	import { isUnitDeletable } from '$lib/complex/complex';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import List from '$lib/design/block/list.svelte';
	import { toNarrowedName } from '$lib/design/csv';
	import * as Cell from '$lib/design/cell';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitForm from './unit-form.svelte';

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
	let unit = $state<UnitRecord | undefined>(undefined);
	let isUnitFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);

	const unitsQuery = useListUnits(
		() => complexId,
		() => search
	);
	const units = $derived(unitsQuery.data ?? []);
	const deleteMutation = useDeleteUnit();
	const importMutation = useImportRecords();

	// what a deletion would be refused for, read before the question is asked rather than
	// after the destructive control is pressed.
	const holdingContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ unitId: unit?.id }),
		() => Boolean(unit)
	);
	const unitBlockers = $derived.by(() => {
		if (!unit || holdingContractsQuery.isPending) return AWAITING_BLOCKERS;

		const held = holdingContractsQuery.data ?? [];

		return isUnitDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedContracts({ count: held.length })];
	});

	// the unit's own page carries neither of these, so a unit card's actions are the only place
	// they are offered — which is why they are reachable both ways rather than by pointer alone
	// (ADR 0034).
	const cardActions = (record: UnitRecord): RecordCardAction[] => [
		{
			label: $LL.common.actions.edit(),
			icon: SquarePenIcon,
			onSelect: () => {
				unit = record;
				isUnitFormOpen = true;
			}
		},
		{
			label: $LL.common.actions.delete(),
			icon: Trash2Icon,
			variant: 'destructive',
			onSelect: () => {
				unit = record;
				isDeleteDialogOpen = true;
			}
		}
	];
</script>

<List
	data={units}
	bind:search
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
			{ header: $LL.common.labels.tenant(), value: (unit) => unit.tenantName ?? '' }
		]
	}}
	onImport={() => void importDialog?.choose()}
	onCreate={() => {
		unit = undefined;
		isUnitFormOpen = true;
	}}
>
	{#snippet record(record: UnitRecord)}
		<RecordCard
			href={resolve(`/complexes/units/${record.id}`)}
			label={record.name}
			actions={cardActions(record)}
		>
			{#snippet content()}
				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<span class="truncate text-sm font-medium">{record.name}</span>
					<!-- who is in it, which is the question the board this replaced existed to answer. -->
					<span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
						{#if record.tenantName}
							<UserIcon class="size-3.5 shrink-0" aria-hidden="true" />
							<span class="truncate">{record.tenantName}</span>
						{:else}
							<span class="truncate">{$LL.common.status.vacant()}</span>
						{/if}
					</span>
				</span>

				<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
					<Cell.Status status={record.status} />
				</span>
			{/snippet}
		</RecordCard>
	{/snippet}
</List>

<UnitForm
	open={isUnitFormOpen}
	onOpenChange={(isOpen) => {
		isUnitFormOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	value={unit}
	{complexId}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	record={unit?.name}
	blockers={unitBlockers}
	onSubmit={async () => {
		if (unit) {
			await deleteMutation.mutateAsync(unit.id);
			// the unit's own page may be behind the reader; it is not somewhere back can return
			// to now that the record is gone.
			back.forget(resolve(`/complexes/units/${unit.id}`));
		}
	}}
/>

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
