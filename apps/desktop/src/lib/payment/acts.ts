import {
	getRefundableFromTotals,
	hasSatisfiedContractPaymentRequirement,
	isRefund
} from '$lib/contract';
import type { RecordAct } from '$lib/act';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { Contract, Payment } from '$lib/platform/database/schema';
import { memberPermissions } from '$lib/permission';
import CopyIcon from '@lucide/svelte/icons/copy';
import FilesIcon from '@lucide/svelte/icons/files';
import PrinterIcon from '@lucide/svelte/icons/printer';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

/**
 * PAYMENT ACTS
 *
 * Everything a person can do to one payment, in the order every surface offers it: the card's menu
 * and its context menu in a contract's ledger, the payment's page, and the command menu. Each of
 * those is a projection of this list (`act/act.ts`), so none of them can offer an act another
 * does not.
 *
 * **A terminated contract's received payments are read-only.** Copying and printing a receipt are
 * reads, so they stand outside that lock; everything that writes is shown refused, saying why and
 * what unlocks it, because it applies to a payment and cannot run now ([[rules/interface]],
 * *Guidance*). A refund is not locked: it is how a terminated contract is settled, so it is edited
 * and deleted there directly (effort 854, requirement 25). The refusal itself is the procedure's;
 * this only decides what the surfaces offer.
 */

/**
 * What an act is given: a payment as any surface holds one, with the status of the contract it
 * was made against where the surface knows it, and what that contract has been paid and requires.
 * A ledger knows them once its contract is read, and a payment's page reads them with the payment.
 */
export type PaymentActRecord = Payment & {
	contractStatus?: Contract['status'];
	contractPaidAmount?: number;
	contractExpectedAmount?: number;
};

/** Every payment act, by the id the palette keys it on. */
export type PaymentActId =
	| 'payment.copyDetails'
	| 'payment.receipt'
	| 'payment.duplicate'
	| 'payment.edit'
	| 'payment.delete';

/**
 * What the acts ask of the payment host. Each one opens something the host owns, and none of them
 * writes anything: the host's form and confirmation are where a payment is changed.
 */
export type PaymentHostRequests = {
	/** put the payment's details on the clipboard. */
	copyDetails: (payment: PaymentActRecord) => void;
	/** open the print preview on the payment's receipt. */
	receipt: (payment: PaymentActRecord) => void;
	/** open the form on a new payment that starts from this one. */
	duplicate: (payment: PaymentActRecord) => void;
	/** open the form on this payment. */
	edit: (payment: PaymentActRecord) => void;
	/** delete this payment, once the reader has answered the question the host asks. */
	confirmDelete: (payment: PaymentActRecord) => void;
};

/** A payment act, with the id narrowed to the ones declared here. */
export type PaymentAct = RecordAct<PaymentActRecord> & { id: PaymentActId };

/**
 * Why the payment takes no change now, or nothing where it does: it was received on a contract that
 * is terminated, whose received payments are read-only until the contract is restored. A refund
 * takes changes there, within its limit, which the procedure weighs.
 */
const toWriteUnavailable = (payment: PaymentActRecord, t: TranslationFunctions) =>
	payment.contractStatus === 'terminated' && !isRefund(payment)
		? t.contracts.payments.refund.locked()
		: undefined;

/**
 * Why the payment cannot be duplicated now, or nothing where it can. A payment received on a
 * terminated contract meets the same lock an edit or a delete does, so it says the same
 * ({@link toWriteUnavailable}): why, and what unlocks it. Otherwise a duplicate is a new payment,
 * refused for what refuses creating one ({@link toPaymentCreateUnavailable}): a contract paid in
 * full takes no new payment either way it is asked for. A refund's duplicate is a new refund,
 * refused for what refuses one ({@link toRefundCreateUnavailable}). Where the surface has not read
 * what the contract is paid, only the lock can refuse.
 */
function toDuplicateUnavailable(payment: PaymentActRecord, t: TranslationFunctions) {
	const {
		contractStatus: status,
		contractPaidAmount: paidAmount,
		contractExpectedAmount: expectedAmount
	} = payment;
	const locked = toWriteUnavailable(payment, t);

	if (locked || status === undefined || paidAmount === undefined || expectedAmount === undefined) {
		return locked;
	}

	// a refund's duplicate is a new refund, refused where nothing more may be refunded.
	return isRefund(payment)
		? toRefundCreateUnavailable({ status, paidAmount, expectedAmount }, t)
		: toPaymentCreateUnavailable({ status, paidAmount, expectedAmount }, t);
}

/**
 * The payment's acts, bound to the host that carries them out: a function of the host so the list
 * can be read, and run, without the host being mounted.
 */
export function declarePaymentActs(host: PaymentHostRequests): PaymentAct[] {
	return [
		{
			id: 'payment.copyDetails',
			label: (t) => t.common.actions.copyDetails(),
			icon: CopyIcon,
			group: 'primary',
			run: host.copyDetails
		},
		{
			// a read: every payment has a receipt, a terminated contract's included. A refund's is
			// a voucher (effort 854, requirement 29), and the act says so where it names one.
			id: 'payment.receipt',
			label: (t, payment) =>
				payment && isRefund(payment)
					? t.contracts.payments.voucher.print()
					: t.contracts.payments.receipt.print(),
			// the glyph every printing act draws, as the schedule's does.
			icon: PrinterIcon,
			group: 'primary',
			flag: 'viewPayment',
			run: host.receipt
		},
		{
			id: 'payment.duplicate',
			label: (t) => t.common.actions.duplicate(),
			icon: FilesIcon,
			group: 'primary',
			flag: 'createPayment',
			unavailable: toDuplicateUnavailable,
			run: host.duplicate
		},
		{
			id: 'payment.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			flag: 'editPayment',
			unavailable: toWriteUnavailable,
			run: host.edit
		},
		{
			id: 'payment.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			flag: 'deletePayment',
			// the record is all it removes, and undo brings it back: it asks first all the same, and
			// says so.
			confirmation: 'reversible',
			unavailable: toWriteUnavailable,
			run: host.confirmDelete
		}
	];
}

/** What a contract has to say about whether it takes a new payment. */
export type PaymentCreateContract = Pick<Contract, 'status' | 'paidAmount' | 'expectedAmount'>;

/**
 * Why a contract takes no new payment, in one line, or nothing where it does: the create act's
 * reason, shown on the ledger's create control and answered by the host wherever a payment is
 * asked for ([[rules/interface]], *Guidance*).
 *
 * A reader who may not add payments is told so first, whatever the contract (effort 838,
 * requirement 10). A terminated contract is read-only. A contract paid in full still takes corrections to what it
 * holds, so only the new payment is refused, and it is refused until the paid total drops below
 * what is required.
 */
export function toPaymentCreateUnavailable(
	contract: PaymentCreateContract | null | undefined,
	t: TranslationFunctions
): string | undefined {
	const refused = memberPermissions.refusal('createPayment', t);

	if (refused || !contract) {
		return refused;
	}

	if (contract.status === 'terminated') {
		return t.contracts.payments.terminatedNotice();
	}

	if (hasSatisfiedContractPaymentRequirement(contract.paidAmount, contract.expectedAmount)) {
		return t.contracts.payments.fullyPaidNotice();
	}

	return undefined;
}

/**
 * Why a contract takes no refund now, in one line, or nothing where it does: the reason the
 * ledger's refund control shows, and the host answers with wherever a refund is asked for
 * ([[rules/interface]], *Guidance*).
 *
 * A reader who may not add payments is told so first, as for a new payment. Otherwise a refund is
 * refused only where nothing may be refunded (effort 854, requirement 26), and the reason says
 * which: a live contract returns only what it was paid beyond its total, and a terminated one only
 * what it received and has not returned yet. The figure is read off the contract's totals; the
 * procedure weighs its rows and stays the authority.
 */
export function toRefundCreateUnavailable(
	contract: PaymentCreateContract | null | undefined,
	t: TranslationFunctions
): string | undefined {
	const refused = memberPermissions.refusal('createPayment', t);

	return refused || (contract ? whyNothingIsRefundable(contract, t) : undefined);
}

/**
 * Why nothing may be refunded from the contract, or nothing where something may: the choice the
 * refund act makes ({@link toRefundCreateUnavailable}) and the refund form states under the limit,
 * made here once so the two read the same sentence. A terminated contract has returned all it
 * received, and a live one was paid nothing beyond its total.
 *
 * `editing` is the amount of a refund being edited, which may always stay what it is
 * (`getRefundableFromTotals`), so an edit is never told that nothing may be refunded.
 */
export function whyNothingIsRefundable(
	contract: PaymentCreateContract,
	t: TranslationFunctions,
	editing = 0
): string | undefined {
	if (getRefundableFromTotals(contract, editing) > 0) {
		return undefined;
	}

	return contract.status === 'terminated'
		? t.contracts.payments.refund.unavailable.nothingLeftToRefund()
		: t.contracts.payments.refund.unavailable.nothingToRefund();
}
