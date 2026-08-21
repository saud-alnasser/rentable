<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '$lib/design/back.svelte';
	import SelectionDialog from '$lib/design/block/selection-dialog.svelte';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionCall,
		type SelectionPlan
	} from '$lib/design/selection';
	import {
		useDeleteManyContracts,
		usePlanManyContracts,
		useRestoreManyContracts,
		useTerminateManyContracts,
		type ContractRefusalReason,
		type ContractSelectionAction
	} from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BanIcon from '@lucide/svelte/icons/ban';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { Snippet } from 'svelte';

	/**
	 * What a selection of contracts offers, and everything those actions need.
	 *
	 * Three surfaces list contracts — the directory, a tenant's page and a unit's — and the set is
	 * one set, for the reason `actions.svelte` gives about a single record: assembled per surface,
	 * what may be done to a selection would come to depend on where the reader met it.
	 *
	 * **The bar carries all three whatever is in the selection.** Whether an action applies to any
	 * of the selected contracts is the confirmation's answer, not the bar's. Knowing it in the bar
	 * would mean planning all three actions on every selection change, which is up to three calls
	 * per checkbox, and the confirmation already makes the bad case safe: an action nothing can
	 * take opens with no destructive control on it.
	 *
	 * The confirmation is mounted here rather than inside the bar, because the bar goes off screen
	 * the moment the selection is put down and the dialog has to outlive that.
	 */
	let {
		onActed,
		children
	}: {
		/**
		 * called once an action has landed, so the surface can put its selection down.
		 *
		 * A callback rather than the selection itself bound in: the ids this acts on are taken
		 * when the reader reaches for a control, so nothing here reads the live selection and a
		 * two-way binding would only ever be written to.
		 */
		onActed: () => void;
		/** the surface's own list, given the controls its selection bar renders. */
		children: Snippet<[Snippet<[readonly string[]]>]>;
	} = $props();

	// the action being asked about and the set it was asked about, taken when the reader reaches
	// for a control: the selection stays live behind the dialog, and an action that read it again
	// at submit time would act on whatever it had become.
	let confirming = $state<{ action: ContractSelectionAction; ids: string[] } | null>(null);

	const terminateMany = useTerminateManyContracts();
	const restoreMany = useRestoreManyContracts();
	const deleteMany = useDeleteManyContracts();

	const planQuery = usePlanManyContracts(
		() => confirming?.ids ?? [],
		() => confirming?.action ?? null
	);

	// the ids the plan came back with, and the contracts as the reader knows them. `null` while
	// the plan is still being read, which is what puts the dialog in its waiting state.
	const plan = $derived.by((): SelectionPlan | null => {
		if (!confirming || !planQuery.data) {
			return null;
		}

		return {
			eligible: planQuery.data.eligible,
			refused: planQuery.data.refused.map((refusal) => ({
				id: refusal.id,
				// a contract that is no longer there has no government id to give, and nothing else
				// about it survived to name it by.
				name: refusal.govId.trim(),
				reason: refusal.reason
			}))
		};
	});

	// the reasons each action can turn a contract away for, in the order they are worth reading:
	// the rule the action itself is about first, and *gone from under you* last, because it is the
	// one nothing the reader did caused.
	const REFUSAL_ORDER = {
		terminate: ['not-terminable', 'missing'],
		restore: ['not-restorable', 'missing'],
		delete: ['holds-units', 'holds-payments', 'missing']
	} as const satisfies Record<ContractSelectionAction, readonly string[]>;

	const titles = $derived({
		terminate: $LL.contracts.selection.terminateTitle(),
		restore: $LL.contracts.selection.restoreTitle(),
		delete: $LL.contracts.selection.deleteTitle()
	});

	const confirmLabels = $derived({
		terminate: {
			label: $LL.common.actions.terminate(),
			loading: $LL.common.actions.terminating()
		},
		restore: {
			label: $LL.common.actions.unterminate(),
			loading: $LL.common.actions.restoring()
		},
		delete: { label: $LL.common.actions.delete(), loading: $LL.common.actions.deleting() }
	});

	function summarize(action: ContractSelectionAction, count: number) {
		switch (action) {
			case 'terminate':
				return $LL.contracts.selection.terminateSummary({ count });
			case 'restore':
				return $LL.contracts.selection.restoreSummary({ count });
			case 'delete':
				return $LL.contracts.selection.deleteSummary({ count });
		}
	}

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes
	// a reason added to the rule without a sentence a build failure rather than a refusal the
	// reader is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'not-terminable': (count: number) => $LL.contracts.selection.refusedNotTerminable({ count }),
			'not-restorable': (count: number) => $LL.contracts.selection.refusedNotRestorable({ count }),
			'holds-units': (count: number) => $LL.contracts.selection.refusedHoldsUnits({ count }),
			'holds-payments': (count: number) => $LL.contracts.selection.refusedHoldsPayments({ count }),
			missing: (count: number) => $LL.contracts.selection.refusedMissing({ count })
		} satisfies Record<ContractRefusalReason, (count: number) => string>)
	);

	/**
	 * Carry out one action over one set.
	 *
	 * Nothing is announced here. Each declaration says how many went through, and says what the
	 * workspace turned away after the confirmation was drawn, both through the shared handlers,
	 * which is where every announcement in this application is raised from. **What the reader
	 * agreed to travels with the call** so the second of those can be said at all: it is the
	 * difference between the plan and the outcome, and a result on its own is only half of it.
	 */
	async function carryOut(action: ContractSelectionAction, call: SelectionCall) {
		switch (action) {
			case 'terminate':
				await terminateMany.mutateAsync(call);

				return;
			case 'restore':
				await restoreMany.mutateAsync(call);

				return;
			case 'delete': {
				const result = await deleteMany.mutateAsync(call);

				// a deleted contract's own page may be behind the reader, and it is not somewhere
				// back can return to now. The single-record deletion does this for the one record it
				// removed; a selection does it for every record it removed.
				for (const contract of result.deleted) {
					back.forget(resolve(`/contracts/${contract.id}`));
				}

				return;
			}
		}
	}

	async function act() {
		if (!confirming) {
			return;
		}

		const { action, ids } = confirming;

		await carryOut(action, { ids, foreseen: foreseenRefusals(plan) });

		// the selection is put down, and the dialog closes itself once this resolves: unmounting it
		// from here would take it off screen mid-close.
		onActed();
	}
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same controls a record's own action cluster wears, so an action means the same thing
	     and looks the same whether it is aimed at one contract or at nine. -->
	{@const count = ids.length}
	<RecordActionControl
		label={`${$LL.common.actions.terminate()} · ${$LL.common.table.recordsSelected({ count })}`}
		icon={BanIcon}
		tone="error"
		onclick={() => (confirming = { action: 'terminate', ids: [...ids] })}
	/>
	<RecordActionControl
		label={`${$LL.common.actions.unterminate()} · ${$LL.common.table.recordsSelected({ count })}`}
		icon={RotateCcwIcon}
		onclick={() => (confirming = { action: 'restore', ids: [...ids] })}
	/>
	<RecordActionControl
		label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count })}`}
		icon={Trash2Icon}
		tone="error"
		onclick={() => (confirming = { action: 'delete', ids: [...ids] })}
	/>
{/snippet}

{@render children(selectionActions)}

{#if confirming}
	{@const action = confirming.action}
	<SelectionDialog
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				confirming = null;
			}
		}}
		title={titles[action]}
		selected={$LL.common.table.recordsSelected({ count: confirming.ids.length })}
		{plan}
		reasons={REFUSAL_ORDER[action]}
		{describeReason}
		summarize={(count) => summarize(action, count)}
		confirmLabel={confirmLabels[action].label}
		confirmLoadingLabel={confirmLabels[action].loading}
		confirmVariant={action === 'restore' ? 'default' : 'destructive'}
		onSubmit={act}
	/>
{/if}
