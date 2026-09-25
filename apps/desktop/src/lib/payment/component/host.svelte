<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import { toDeleteStep, toPaletteVerbs } from '$lib/design/acts';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import {
		showErrorSentence,
		showErrorToast,
		showRefusal,
		showSuccessToast
	} from '$lib/error/toast';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import { toPaymentCreateUnavailable, type PaymentActRecord } from '$lib/payment/acts';
	import {
		closePaymentConfirmation,
		closePaymentForm,
		openNewPaymentForm,
		paymentActs,
		paymentHostState,
		resetPaymentHost
	} from '$lib/payment/host.svelte';
	import { useReadContract } from '$lib/contract/query';
	import { useDeletePayment, useReadPayment, useReadPaymentReceipt } from '$lib/payment/query';
	import PrintPreview from '$lib/print/component/preview.svelte';
	import { sendPage } from '$lib/print/sheet.svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { formatLocaleMoney } from '$lib/platform/locale';
	import { landing } from '$lib/design/landing.svelte';
	import { onDestroy, untrack } from 'svelte';
	import PaymentForm from './form.svelte';
	import PrintedReceipt, { type PrintedReceiptValue } from './receipt.svelte';

	/**
	 * The payment form and the payment's delete, mounted once for the whole shell. A delete runs at
	 * once and offers undo, as its act declares; nothing refuses a payment's, so no dialog is drawn
	 * for it unless the act comes to declare one ([[rules/interface]], *Delete and confirm*).
	 *
	 * A payment's acts are one list (`payment/acts.ts`), and every surface offering them is a
	 * projection of it; what those acts open is here, so there is one `PaymentForm` in the tree.
	 * `payment/host.svelte.ts` is the request the surfaces raise and this answers, the way
	 * `contract/component/host.svelte` answers the contract's.
	 *
	 * **The mutation is here**, inside the providers, so it reads the query client from context the
	 * way every other hook does. What it writes, and how it is taken back, is unchanged from when
	 * each surface mounted its own copy.
	 */

	const deleteMutation = useDeletePayment();
	const readPayment = useReadPayment();
	const readContract = useReadContract();
	const readReceipt = useReadPaymentReceipt();
	// the workspace the shell names, which is who issues a receipt. The one query the rail's header
	// reads, so the receipt and the header cannot name it differently.
	const remoteSyncQuery = useFetchRemoteSyncState();

	const deleting = $derived(paymentHostState.deleting);

	// a payment has no name, and the nearest thing to one is its amount in the reader's locale.
	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// whether the delete asks or runs now, by the act's own policy. Nothing refuses a payment's
	// delete, so there is nothing to wait on.
	const deletePolicy = paymentActs.find((act) => act.id === 'payment.delete')?.confirmation;
	const deleteStep = $derived(deleting ? toDeleteStep(deletePolicy, undefined) : 'wait');

	async function deleteConfirmed() {
		if (!deleting) {
			return;
		}

		const { id, contractId } = deleting;

		await deleteMutation.mutateAsync(id);
		closePaymentConfirmation();
		await leaveDeleted(id, contractId);
	}

	/** A delete nothing asked about: its refusal, where it earns one, is raised rather than held. */
	async function deleteAtOnce(id: string, contractId: string) {
		try {
			await deleteMutation.mutateAsync(id);
		} catch (error) {
			showRefusal(error, $LL);

			return;
		}

		await leaveDeleted(id, contractId);
	}

	async function leaveDeleted(id: string, contractId: string) {
		const recordPage = resolve(`/contracts/payments/${id}`);

		// the payment's own page is not somewhere back can return to now that the record is gone.
		// Where the reader is standing on it, they are taken to the contract it was made against;
		// anywhere else, the page is only forgotten from behind them.
		if (page.url.pathname === recordPage) {
			back.forgetCurrent();
			await goto(resolve(`/contracts/${contractId}`));

			return;
		}

		back.forget(recordPage);
	}

	/**
	 * A payment's stated details on the clipboard, the same from a ledger's card as from its page:
	 * the payment is read for the tenant and the contract a ledger's row does not carry.
	 */
	async function copyDetails(payment: PaymentActRecord) {
		const read = await readPayment(payment.id).catch(() => undefined);

		const copied = await writeDetailsToClipboard([
			{ label: $LL.common.labels.amount(), value: formatMoney(read?.amount ?? payment.amount) },
			{ label: $LL.common.labels.tenant(), value: read?.tenantName ?? '' },
			{ label: $LL.common.labels.contractNumber(), value: read?.contractGovId ?? '' }
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
	 * the receipt being previewed, the language it is shown in, and whether it is on its way to
	 * paper or a file. Raw, because a receipt is only ever replaced.
	 */
	let receipt = $state.raw<PrintedReceiptValue | null>(null);
	let receiptOpen = $state(false);
	let receiptLocale = $state<Locales>('en');
	let sending = $state(false);

	/**
	 * A payment's receipt, shown first in the application's own preview: what it states is read
	 * afresh, and the preview opens on the language the application shows.
	 */
	async function previewReceipt(payment: PaymentActRecord) {
		try {
			// the rail's header has almost always read it already; where it has not, it is read now,
			// so a receipt is never shown without the name of who issued it.
			const [read, workspace] = await Promise.all([
				readReceipt(payment.id),
				remoteSyncQuery.data?.workspace ??
					remoteSyncQuery.refetch().then((answer) => answer.data?.workspace)
			]);
			const issuer = workspace?.name?.trim();

			if (!issuer) {
				showErrorSentence($LL.print.failed());

				return;
			}

			receipt = { ...read, issuer };
			receiptLocale = $locale;
			receiptOpen = true;
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

	/** The previewed receipt, in the language chosen, to paper or to a PDF. */
	async function sendReceipt(mode: 'print' | 'pdf') {
		if (!receipt || sending) {
			return;
		}

		sending = true;

		try {
			const title = i18nObject(receiptLocale).contracts.payments.receipt.title();
			const outcome = await sendPage(printedReceipt, mode, `${title} ${receipt.reference}.pdf`);

			if (outcome !== 'cancelled') {
				receiptOpen = false;

				if (outcome === 'saved') {
					showSuccessToast($LL.print.saved());
				}
			}
		} catch {
			showErrorSentence($LL.print.failed());
		} finally {
			sending = false;
		}
	}

	/**
	 * An act named by a payment's identity: read the payment, then answer on the terms the command
	 * menu's own projection gives for it, so an act a terminated contract's payment does not admit
	 * is refused with a sentence rather than run.
	 */
	async function answerAsked(actId: string, paymentId: string) {
		let payment: PaymentActRecord | undefined;

		try {
			payment = await readPayment(paymentId);
		} catch (error) {
			showErrorToast(error, $LL);

			return;
		}

		if (!payment) {
			showErrorSentence($LL.common.errors.notFound());

			return;
		}

		const verb = toPaletteVerbs(paymentActs, payment, $LL, usesAppleKeyboard()).find(
			(offered) => offered.id === actId
		);

		if (!verb) {
			const act = paymentActs.find((declared) => declared.id === actId);

			showErrorSentence(
				$LL.common.ui.commandPaletteActDoesNotApply({
					act: act?.label($LL) ?? actId,
					record: formatMoney(payment.amount)
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

	/**
	 * A new payment against the contract named: read the contract, and open the form where it takes
	 * one. Where it takes none the create act's reason is the answer, the same line the ledger's
	 * create control shows, so the command menu cannot open a form the ledger would refuse.
	 */
	async function answerCreate(contractId: string) {
		let contract: Awaited<ReturnType<typeof readContract>>;

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

		const reason = toPaymentCreateUnavailable(contract, $LL);

		if (reason) {
			showErrorSentence(reason);

			return;
		}

		openNewPaymentForm(contractId);
	}

	// both requests are answered once and cleared first, so an answer that takes a read cannot be
	// asked twice by the effect running again while it waits.
	$effect(() => {
		const payment = paymentHostState.copying;

		if (!payment) {
			return;
		}

		paymentHostState.copying = null;
		untrack(() => void copyDetails(payment));
	});

	$effect(() => {
		const payment = paymentHostState.printing;

		if (!payment) {
			return;
		}

		paymentHostState.printing = null;
		untrack(() => void previewReceipt(payment));
	});

	$effect(() => {
		const creating = paymentHostState.creating;

		if (!creating) {
			return;
		}

		paymentHostState.creating = null;
		untrack(() => void answerCreate(creating.contractId));
	});

	$effect(() => {
		const asked = paymentHostState.asked;

		if (!asked) {
			return;
		}

		paymentHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.paymentId));
	});

	// the request is answered once and cleared first, as the two above are.
	$effect(() => {
		if (deleteStep !== 'run' || !deleting) {
			return;
		}

		const { id, contractId } = deleting;

		closePaymentConfirmation();
		untrack(() => void deleteAtOnce(id, contractId));
	});

	onDestroy(resetPaymentHost);
</script>

{#snippet printedReceipt()}
	{#if receipt}
		<PrintedReceipt value={receipt} locale={receiptLocale} />
	{/if}
{/snippet}

{#snippet receiptPage(pageLocale: Locales)}
	{#if receipt}
		<PrintedReceipt value={receipt} locale={pageLocale} />
	{/if}
{/snippet}

<PrintPreview
	open={receiptOpen}
	onOpenChange={(isOpen) => {
		if (!isOpen) receiptOpen = false;
	}}
	title={$LL.contracts.payments.receipt.print()}
	bind:locale={receiptLocale}
	page={receiptPage}
	busy={sending}
	onSave={() => void sendReceipt('pdf')}
	onPrint={() => void sendReceipt('print')}
/>

<!-- mounted once a contract has been named: the form reads what that contract still has due, and
     a form with no contract has nothing it could write to. -->
{#if paymentHostState.form.contractId}
	{#key paymentHostState.form.key}
		<PaymentForm
			contractId={paymentHostState.form.contractId}
			value={paymentHostState.form.value}
			open={paymentHostState.form.open}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					closePaymentForm();
				}
			}}
			onCreated={(created) => landing.land(created.id)}
		/>
	{/key}
{/if}

<DeleteDialog
	open={deleting !== null && deleteStep === 'ask'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closePaymentConfirmation();
		}
	}}
	record={deleting ? formatMoney(deleting.amount) : undefined}
	onSubmit={deleteConfirmed}
/>
