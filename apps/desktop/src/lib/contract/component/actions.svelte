<script lang="ts" module>
	import type api from '$lib/api/caller';
	import type { RecordCardAction } from '$lib/design/block/record-card.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];
	// the same shape without an identity is what a duplicate opens the form on.
	type ContractFormValue = Omit<ContractRow, 'id'> & { id?: string };

	/** What a surface listing contracts is given for each contract it renders. */
	export type ContractActions = {
		/** what this contract offers, on the terms its own status allows. */
		of: (contract: ContractRow) => RecordCardAction[];
		/** open the form on nothing, for a surface that creates contracts as well. */
		create: () => void;
	};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import {
		canManuallyTerminateContractStatus,
		canUnterminateContractStatus,
		isContractDeletable
	} from '$lib/contract/contract';
	import {
		useDeleteContract,
		useFetchContractUnits,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/contract/query';
	import { useFetchContractPayments } from '$lib/payment/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import FilesIcon from '@lucide/svelte/icons/files';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack, type Snippet } from 'svelte';
	import ContractForm from './form.svelte';

	/**
	 * A contract's actions, and everything they need to be carried out.
	 *
	 * Three surfaces list a contract — the directory, a unit's page and a tenant's — and the set
	 * is one set: which actions a contract's status allows, what each one asks before it happens,
	 * and what a deletion is refused for. Assembled per surface, the terms a contract may be
	 * restored on would come to depend on where the reader met it, which is the drift this
	 * removes.
	 *
	 * The confirmations and the form are mounted here, once for the whole list, because a card's
	 * actions all act on the one record the reader reached for.
	 */
	let {
		children,
		createRequested = false,
		onCreateRequestConsumed
	}: {
		/** the surface's own list, given what each contract offers. */
		children: Snippet<[ContractActions]>;
		/** whether the surface is asking for the form to open on nothing. */
		createRequested?: boolean;
		/** called once that request has been honoured, so the surface can clear what asked. */
		onCreateRequestConsumed?: () => void;
	} = $props();

	let isFormOpen = $state(false);
	let formRenderKey = $state(0);
	let formOpensOn = $state<ContractFormValue | undefined>(undefined);
	// the contract the form is renewing, where it was opened to renew one. Held beside what the
	// form opens *on* rather than inside it: a renewal is opened on an identity and reads
	// everything else off the contract itself.
	let renewingContractId = $state<string | undefined>(undefined);
	// the one record a card's menu is acting on and what it is being asked, which is what makes
	// one confirmation of each kind enough for a whole list.
	let confirming = $state<{
		contract: ContractRow;
		kind: 'delete' | 'terminate' | 'restore';
	} | null>(null);

	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	// what a deletion would be refused for, read for the record being acted on and only while a
	// deletion is what it is being asked. Both reads, because the rule weighs both.
	const isDeleting = $derived(confirming?.kind === 'delete');
	const heldUnitsQuery = useFetchContractUnits(
		() => confirming?.contract.id ?? '',
		() => isDeleting
	);
	const heldPaymentsQuery = useFetchContractPayments(
		() => confirming?.contract.id ?? '',
		() => isDeleting
	);
	const deleteBlockers = $derived.by(() => {
		if (!isDeleting) {
			return [];
		}

		if (heldUnitsQuery.isPending || heldPaymentsQuery.isPending) {
			return AWAITING_BLOCKERS;
		}

		const units = heldUnitsQuery.data ?? [];
		const payments = heldPaymentsQuery.data ?? [];

		if (isContractDeletable(units, payments)) {
			return [];
		}

		return [
			units.length ? $LL.common.deleteDialog.blockedUnits({ count: units.length }) : null,
			payments.length ? $LL.common.deleteDialog.blockedPayments({ count: payments.length }) : null
		].filter((blocker) => blocker !== null);
	});

	const openForm = (value: ContractFormValue | undefined) => {
		formOpensOn = value;
		renewingContractId = undefined;
		formRenderKey += 1;
		isFormOpen = true;
	};

	const openRenewal = (id: string) => {
		formOpensOn = undefined;
		renewingContractId = id;
		formRenderKey += 1;
		isFormOpen = true;
	};

	// what the record's own page offers, minus opening it, and offered on exactly the same terms:
	// the predicates that decide whether a contract may be terminated or put back are the domain's,
	// so a card and a page cannot come to disagree about what may be done to one.
	const actionsOf = (contract: ContractRow): RecordCardAction[] => [
		{
			label: $LL.common.actions.duplicate(),
			icon: FilesIcon,
			onSelect: () =>
				// the government id is a contract's unique field, so the copy starts without it rather
				// than with a value that cannot be saved.
				openForm({ ...contract, id: undefined, govId: '' })
		},
		{
			// a duplicate copies the term; a renewal continues it. Both produce a new contract,
			// which is why they sit together at the head of the menu.
			label: $LL.common.actions.renew(),
			icon: CalendarPlusIcon,
			onSelect: () => openRenewal(contract.id)
		},
		...(contract.status === 'terminated'
			? []
			: [
					{
						label: $LL.common.actions.edit(),
						icon: SquarePenIcon,
						onSelect: () => openForm(contract)
					}
				]),
		...(canManuallyTerminateContractStatus(contract.status)
			? [
					{
						label: $LL.common.actions.terminate(),
						icon: BanIcon,
						variant: 'destructive' as const,
						onSelect: () => {
							confirming = { contract, kind: 'terminate' };
						}
					}
				]
			: []),
		...(canUnterminateContractStatus(contract.status)
			? [
					{
						label: $LL.common.actions.unterminate(),
						icon: RotateCcwIcon,
						onSelect: () => {
							confirming = { contract, kind: 'restore' };
						}
					}
				]
			: []),
		{
			label: $LL.common.actions.delete(),
			icon: Trash2Icon,
			variant: 'destructive',
			onSelect: () => {
				confirming = { contract, kind: 'delete' };
			}
		}
	];

	const actions: ContractActions = {
		of: actionsOf,
		create: () => openForm(undefined)
	};

	// what the confirmation names the record as, the way its own page names it.
	const confirmingRecord = $derived(
		confirming
			? confirming.contract.govId?.trim() ||
					confirming.contract.tenantName?.trim() ||
					$LL.common.labels.contract()
			: undefined
	);

	const runOnConfirming = async (run: (id: string) => Promise<unknown>) => {
		if (!confirming) {
			return;
		}

		await run(confirming.contract.id);
		confirming = null;
	};

	const deleteConfirming = () =>
		runOnConfirming(async (id) => {
			await deleteMutation.mutateAsync(id);
			// the contract's own page may be behind the reader; it is not somewhere back can return
			// to now that the record is gone. Every surface listing a contract gets this, because
			// every one of them can be reached from that page.
			back.forget(resolve(`/contracts/${id}`));
		});

	// opening is untracked because it advances the render key by reading it, and an effect that
	// reads what it writes never settles.
	$effect(() => {
		if (!createRequested) {
			return;
		}

		untrack(() => openForm(undefined));
		onCreateRequestConsumed?.();
	});
</script>

{@render children(actions)}

{#key formRenderKey}
	<ContractForm
		open={isFormOpen}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				formRenderKey += 1;
			}

			isFormOpen = isOpen;
		}}
		value={formOpensOn}
		renewsContractId={renewingContractId}
	/>
{/key}

<DeleteDialog
	open={confirming?.kind === 'delete'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	blockers={deleteBlockers}
	onSubmit={deleteConfirming}
/>

<DeleteDialog
	open={confirming?.kind === 'terminate'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.terminateTitle()}
	description={$LL.contracts.table.terminateDescription()}
	confirmLabel={$LL.common.actions.terminate()}
	confirmLoadingLabel={$LL.common.actions.terminating()}
	onSubmit={() => runOnConfirming((id) => terminateMutation.mutateAsync(id))}
/>

<DeleteDialog
	open={confirming?.kind === 'restore'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.restoreTitle()}
	description={$LL.contracts.table.restoreDescription()}
	confirmLabel={$LL.common.actions.unterminate()}
	confirmLoadingLabel={$LL.common.actions.restoring()}
	confirmVariant="default"
	onSubmit={() => runOnConfirming((id) => unterminateMutation.mutateAsync(id))}
/>
