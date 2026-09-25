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
		useReadContractReminder,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/contract/query';
	import { composeReminderMessage, toWhatsAppUrl } from '$lib/contract/reminder';
	import { toDeleteStep, toPaletteVerbs } from '$lib/design/acts';
	import { consumeCreateIntent } from '$lib/design/create-intent.svelte';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { showErrorSentence, showErrorToast, showRefusal } from '$lib/error/toast';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useFetchContractPayments } from '$lib/payment/query';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { tauri } from '$lib/platform/tauri';
	import { formatRecordDateRange } from '$lib/design/date';
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
	 * **A delete runs at once and offers undo**, as its act declares; the delete dialog is drawn only
	 * where something refuses it, to say what. Terminating and restoring ask first, in the confirm
	 * dialog under their own verbs ([[rules/interface]], *Delete and confirm*).
	 *
	 * **Drawn while a session is held**, which the frame decides; what is here on unmount is reset,
	 * so a form left open at sign-out does not reopen on the next sign-in.
	 */

	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();
	const readContract = useReadContract();
	const readReminder = useReadContractReminder();
	const readTenant = useReadTenant();

	const confirming = $derived(contractHostState.confirming);

	// what a deletion would be refused for, read for the record being acted on and only while a
	// deletion is what it is being asked. Its payments alone: the units it holds go with it.
	const isDeleting = $derived(confirming?.kind === 'delete');
	const heldPaymentsQuery = useFetchContractPayments(
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

	/** A delete nothing asked about: its refusal, where it earns one, is raised rather than held. */
	async function deleteAtOnce(id: string) {
		try {
			await deleteMutation.mutateAsync(id);
		} catch (error) {
			showRefusal(error, $LL);

			return;
		}

		await leaveDeleted(id);
	}

	// whether the delete asks, waits on what refuses it, or runs now, by the act's own policy.
	const deletePolicy = contractActs.find((act) => act.id === 'contract.delete')?.confirmation;
	const deleteStep = $derived(isDeleting ? toDeleteStep(deletePolicy, deleteBlockers) : 'wait');

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
	 * Open WhatsApp on a chat with the contract's tenant, the reminder written in the language the
	 * application is showing. The facts are read fresh, so the amount is today's; the landlord reads
	 * the message and sends it, and nothing here records that a reminder went.
	 */
	async function remind(contract: ContractActRecord) {
		try {
			const reminder = await readReminder(contract.id);
			const message = composeReminderMessage(reminder, $LL, $locale);

			await tauri.opener.openUrl(toWhatsAppUrl(reminder.tenantPhone, message));
		} catch (error) {
			showErrorToast(error, $LL);
		}
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
		const contract = contractHostState.reminding;

		if (!contract) {
			return;
		}

		contractHostState.reminding = null;
		untrack(() => void remind(contract));
	});

	$effect(() => {
		const asked = contractHostState.asked;

		if (!asked) {
			return;
		}

		contractHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.contractId));
	});

	// the request is answered once and cleared first, as the two above are.
	$effect(() => {
		if (deleteStep !== 'run' || !confirming) {
			return;
		}

		const { id } = confirming.contract;

		closeContractConfirmation();
		untrack(() => void deleteAtOnce(id));
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
	open={confirming?.kind === 'delete' && deleteStep === 'ask'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeContractConfirmation();
		}
	}}
	record={confirmingRecord}
	blockers={deleteBlockers}
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
