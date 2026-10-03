<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import type { ContractActRecord } from '$lib/contract/acts';
	import { isContractDeletable } from '$lib/contract/contract';
	import {
		closeContractConfirmation,
		closeContractForm,
		contractActs,
		contractHost,
		contractHostState,
		resetContractHost
	} from '$lib/contract/host.svelte';
	import {
		useDeleteContract,
		useReadContract,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/contract/query';
	import { toPaletteVerbs } from '$lib/act';
	import { consumeCreateIntent } from '$lib/create/ui';
	import { onMutationError, onMutationSuccess } from '$lib/mutation/ui';
	import { showErrorSentence, showErrorToast } from '$lib/notification';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { contributionsTo } from '$lib/feature/surface';
	import { formatRecordDateRange } from '$lib/date';
	import { TENANT_KIND } from '$lib/tenant';
	import { useReadTenant } from '$lib/tenant/ui';
	import { memberPermissions } from '$lib/permission';
	import { onDestroy, untrack } from 'svelte';
	import ContractForm from './form.svelte';
	import PrintHost from '$lib/contract/schedule/component/print-host.svelte';
	import ReminderHost from '$lib/contract/schedule/component/reminder-host.svelte';

	/**
	 * Every form and confirmation a contract act opens, mounted once for the whole shell.
	 *
	 * A contract's acts are one list (`contract/acts.ts`), and every surface offering them is a
	 * projection of it; what those acts open is here, so there is one `ContractForm` in the tree and
	 * one confirmation of each kind. `contract/host.svelte.ts` is the request the surfaces raise and
	 * this answers, the way `organization/dialogs.svelte.ts` is for the organization surfaces.
	 *
	 * **The mutations are here**, inside the providers, so each reads the query client from context
	 * the way every other hook does. What they write, and how each is taken back, is unchanged from
	 * when each surface mounted its own copy.
	 *
	 * **Every one of them asks first** ([[rules/interface]], *Delete and confirm*): a
	 * delete in the delete dialog, saying undo brings the contract back or what refuses it, and
	 * terminating and restoring in the confirm dialog under their own verbs.
	 *
	 * **The reminder and the printed schedule are the schedule's**, each answered by a host of its
	 * own under `schedule/component/`, mounted here so they are drawn where this is.
	 *
	 * **Drawn while a session is held**, which the frame decides; what is here on unmount is reset,
	 * so a form left open at sign-out does not reopen on the next sign-in.
	 */

	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();
	const readContract = useReadContract();
	const readTenant = useReadTenant();

	const confirming = $derived(contractHostState.confirming);

	// what a deletion would be refused for, read for the record being acted on and only while a
	// deletion is what it is being asked. Its payments alone: the units it holds go with it.
	const isDeleting = $derived(confirming?.kind === 'delete');
	// the payments are the payment's to read, and it contributes the read.
	const heldPaymentsQuery = contributionsTo('contract').useHeldPayments(
		() => confirming?.contract.id ?? '',
		() => isDeleting
	);
	const deleteBlockers = $derived.by(() => {
		if (!isDeleting) {
			return [];
		}

		if (heldPaymentsQuery.isPending) {
			return AWAITING_BLOCKERS;
		}

		const payments = heldPaymentsQuery.data ?? [];

		if (isContractDeletable(payments)) {
			return [];
		}

		return [$LL.common.deleteDialog.blockedPayments({ count: payments.length })];
	});

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
		closeContractConfirmation();
	};

	async function leaveDeleted(id: string) {
		const recordPage = resolve(`/contracts/${id}`);

		// the contract's own page is not somewhere back can return to now that the record is gone.
		// Where the reader is standing on it, they are taken to the directory; anywhere else, the
		// page is only forgotten from behind them.
		if (page.url.pathname === recordPage) {
			back.forgetCurrent();
			await goto(resolve('/contracts'));

			return;
		}

		back.forget(recordPage);
	}

	const deleteConfirming = () =>
		runOnConfirming(async (id) => {
			await deleteMutation.mutateAsync(id);
			await leaveDeleted(id);
		});

	const intervalLabels = $derived<Record<ContractActRecord['interval'], string>>({
		'1m': $LL.contracts.intervals.monthly(),
		'3m': $LL.contracts.intervals.quarterly(),
		'6m': $LL.contracts.intervals.semiAnnual(),
		'12m': $LL.contracts.intervals.annual()
	});

	/**
	 * A contract's stated details on the clipboard, the same from a card as from its page: the
	 * tenant is read for what the contract row does not carry, so neither surface copies less.
	 */
	async function copyDetails(contract: ContractActRecord) {
		// the tenant is neither read nor copied for a reader who may not view tenants (effort 838,
		// requirement 10).
		const viewsTenant = memberPermissions.views(TENANT_KIND);
		const tenant = viewsTenant
			? await readTenant(contract.tenantId).catch(() => undefined)
			: undefined;

		const copied = await writeDetailsToClipboard([
			...(viewsTenant
				? [
						{
							label: $LL.common.labels.tenant(),
							value:
								tenant?.name?.trim() || contract.tenantName?.trim() || $LL.common.labels.tenant()
						},
						{ label: $LL.common.labels.nationalId(), value: tenant?.nationalId ?? '' },
						{
							label: $LL.common.labels.phone(),
							value: tenant?.phone ?? contract.tenantPhone ?? ''
						}
					]
				: []),
			{ label: $LL.common.labels.governmentId(), value: contract.govId ?? '' },
			{ label: $LL.common.labels.cycle(), value: intervalLabels[contract.interval] },
			{
				label: $LL.common.labels.contractPeriod(),
				value: formatRecordDateRange($locale, contract.start, contract.end)
			}
		]);

		if (copied) {
			onMutationSuccess({ toast: { success: () => $LL.common.messages.copied() } });

			return;
		}

		onMutationError(
			{ toast: { unexpected: () => $LL.common.messages.copyFailed() } },
			new Error('the clipboard refused')
		);
	}

	/**
	 * An act named by a contract's identity: read the contract, then answer on the terms the
	 * command menu's own projection gives for it, so an act the contract does not admit is refused
	 * with a sentence rather than run.
	 */
	async function answerAsked(actId: string, contractId: string) {
		let contract: ContractActRecord | undefined;

		try {
			contract = await readContract(contractId);
		} catch (error) {
			showErrorToast(error, $LL);

			return;
		}

		if (!contract) {
			showErrorSentence($LL.common.errors.notFound());

			return;
		}

		const verbs = toPaletteVerbs(contractActs, contract, $LL, usesAppleKeyboard());
		const verb = verbs.find((offered) => offered.id === actId);
		const act = contractActs.find((declared) => declared.id === actId);

		if (!verb) {
			showErrorSentence(
				$LL.common.ui.commandPaletteActDoesNotApply({
					act: act?.label($LL) ?? actId,
					record: contract.govId.trim() || $LL.common.labels.contract()
				})
			);

			return;
		}

		if (verb.unavailable) {
			showErrorSentence(verb.unavailable);

			return;
		}

		verb.run();
	}

	// both requests are answered once and cleared first, so an answer that takes a read cannot be
	// asked twice by the effect running again while it waits. Untracked past the read, because the
	// work writes state this effect would otherwise start depending on.
	$effect(() => {
		const contract = contractHostState.copying;

		if (!contract) {
			return;
		}

		contractHostState.copying = null;
		untrack(() => void copyDetails(contract));
	});

	$effect(() => {
		const asked = contractHostState.asked;

		if (!asked) {
			return;
		}

		contractHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.contractId));
	});

	/**
	 * A new contract opens its own page, which is where its next step is: its units, its
	 * payments, its term ([[rules/interface]], *Guidance*).
	 */
	async function openCreated(id: string) {
		await goto(resolve(`/contracts/${id}`));
	}

	// the command menu's new contract arrives as `?create` on its directory. The host that owns the
	// form answers it, rather than the directory ([[rules/interface]], *Create*).
	consumeCreateIntent(resolve('/contracts'), () => contractHost.create());

	onDestroy(resetContractHost);
</script>

<ReminderHost />

<PrintHost />

{#key contractHostState.form.key}
	<ContractForm
		open={contractHostState.form.open}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				closeContractForm();
			}
		}}
		value={contractHostState.form.value}
		renewsContractId={contractHostState.form.renewsContractId}
		prefill={contractHostState.form.prefill}
		onCreated={(created) => void openCreated(created.id)}
	/>
{/key}

<DeleteDialog
	open={confirming?.kind === 'delete'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeContractConfirmation();
		}
	}}
	record={confirmingRecord}
	blockers={deleteBlockers}
	description={$LL.common.deleteDialog.undoable()}
	onSubmit={deleteConfirming}
/>

<!-- terminate and restore are not deletes, so they ask in the confirm dialog, named for the act. -->
<ConfirmDialog
	open={confirming?.kind === 'terminate'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeContractConfirmation();
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.terminateTitle()}
	description={$LL.contracts.table.terminateDescription()}
	confirmLabel={$LL.common.actions.terminate()}
	confirmLoadingLabel={$LL.common.actions.terminating()}
	tone="error"
	onSubmit={() => runOnConfirming((id) => terminateMutation.mutateAsync(id))}
/>

<ConfirmDialog
	open={confirming?.kind === 'restore'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeContractConfirmation();
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.restoreTitle()}
	description={$LL.contracts.table.restoreDescription()}
	confirmLabel={$LL.common.actions.unterminate()}
	confirmLoadingLabel={$LL.common.actions.restoring()}
	tone="neutral"
	onSubmit={() => runOnConfirming((id) => unterminateMutation.mutateAsync(id))}
/>
