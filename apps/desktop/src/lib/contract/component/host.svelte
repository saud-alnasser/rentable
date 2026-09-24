<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import type { ContractActRecord } from '$lib/contract/acts';
	import { isContractDeletable } from '$lib/contract/contract';
	import {
		closeContractConfirmation,
		closeContractForm,
		contractActs,
		contractHostState,
		resetContractHost
	} from '$lib/contract/host.svelte';
	import {
		useDeleteContract,
		useFetchContractUnits,
		useReadContract,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/contract/query';
	import { toPaletteVerbs } from '$lib/design/acts';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { showErrorSentence, showErrorToast } from '$lib/error/toast';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useFetchContractPayments } from '$lib/payment/query';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { useReadTenant } from '$lib/tenant/query';
	import { onDestroy, untrack } from 'svelte';
	import ContractForm from './form.svelte';

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

	const deleteConfirming = () =>
		runOnConfirming(async (id) => {
			await deleteMutation.mutateAsync(id);

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
		const tenant = await readTenant(contract.tenantId).catch(() => undefined);
		const formatDate = (value: number) =>
			formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

		const copied = await writeDetailsToClipboard([
			{
				label: $LL.common.labels.tenant(),
				value: tenant?.name?.trim() || contract.tenantName?.trim() || $LL.common.labels.tenant()
			},
			{ label: $LL.common.labels.nationalId(), value: tenant?.nationalId ?? '' },
			{ label: $LL.common.labels.phone(), value: tenant?.phone ?? contract.tenantPhone ?? '' },
			{ label: $LL.common.labels.governmentId(), value: contract.govId ?? '' },
			{ label: $LL.common.labels.cycle(), value: intervalLabels[contract.interval] },
			{
				label: $LL.common.labels.contractPeriod(),
				value: `${formatDate(contract.start)} – ${formatDate(contract.end)}`
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

	onDestroy(resetContractHost);
</script>

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
	onSubmit={deleteConfirming}
/>

<!-- terminate and restore keep the delete dialog's shape until the confirm pattern replaces it. -->
<DeleteDialog
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
	onSubmit={() => runOnConfirming((id) => terminateMutation.mutateAsync(id))}
/>

<DeleteDialog
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
	confirmVariant="default"
	onSubmit={() => runOnConfirming((id) => unterminateMutation.mutateAsync(id))}
/>
