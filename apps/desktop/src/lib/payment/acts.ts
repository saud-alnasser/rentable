import { hasSatisfiedContractPaymentRequirement } from '$lib/contract/contract';
import type { RecordAct } from '$lib/design/acts';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { Contract, Payment } from '$lib/platform/database/schema';
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
 * those is a projection of this list (`design/acts.ts`), so none of them can offer an act another
 * does not.
 *
 * **A terminated contract's payments are read-only.** Copying and printing a receipt are reads, so
 * they stand outside that lock; everything that writes is shown refused, with the contract's state
 * as its reason, because it applies to a payment and cannot run now ([[rules/interface]],
 * *Guidance*). The refusal itself is the procedure's; this only decides what the surfaces offer.
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
	/** print the payment's receipt through the system's print dialog. */
	receipt: (payment: PaymentActRecord) => void;
	/** open the form on a new payment that starts from this one. */
	duplicate: (payment: PaymentActRecord) => void;
	/** open the form on this payment. */
	edit: (payment: PaymentActRecord) => void;
	/** delete this payment: at once where nothing refuses it, as its policy says; the host decides. */
	confirmDelete: (payment: PaymentActRecord) => void;
};

/** A payment act, with the id narrowed to the ones declared here. */
export type PaymentAct = RecordAct<PaymentActRecord> & { id: PaymentActId };

/**
 * Why the payment takes no change now, or nothing where it does: its contract is terminated, and a
 * terminated contract's statement is read-only.
 */
const toWriteUnavailable = (payment: PaymentActRecord, t: TranslationFunctions) =>
	payment.contractStatus === 'terminated' ? t.contracts.payments.terminatedNotice() : undefined;

/**
 * Why the payment cannot be duplicated now, or nothing where it can. A duplicate is a new payment,
 * so it is refused for what refuses creating one ({@link toPaymentCreateUnavailable}): a contract
 * paid in full takes no new payment either way it is asked for. Where the surface has not read
 * what the contract is paid, only its status can refuse.
 */
function toDuplicateUnavailable(payment: PaymentActRecord, t: TranslationFunctions) {
	const {
		contractStatus: status,
		contractPaidAmount: paidAmount,
		contractExpectedAmount: expectedAmount
	} = payment;

	if (status === undefined || paidAmount === undefined || expectedAmount === undefined) {
		return toWriteUnavailable(payment, t);
	}

	return toPaymentCreateUnavailable({ status, paidAmount, expectedAmount }, t);
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
			// a read: every payment has a receipt, a terminated contract's included.
			id: 'payment.receipt',
			label: (t) => t.contracts.payments.receipt.print(),
			// the glyph every printing act draws, as the schedule's does.
			icon: PrinterIcon,
			group: 'primary',
			run: host.receipt
		},
		{
			id: 'payment.duplicate',
			label: (t) => t.common.actions.duplicate(),
			icon: FilesIcon,
			group: 'primary',
			unavailable: toDuplicateUnavailable,
			run: host.duplicate
		},
		{
			id: 'payment.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			unavailable: toWriteUnavailable,
			run: host.edit
		},
		{
			id: 'payment.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			// the record is all it removes, so it runs at once and offers undo.
			confirmation: 'none',
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
 * A terminated contract is read-only. A contract paid in full still takes corrections to what it
 * holds, so only the new payment is refused, and it is refused until the paid total drops below
 * what is required.
 */
export function toPaymentCreateUnavailable(
	contract: PaymentCreateContract | undefined,
	t: TranslationFunctions
): string | undefined {
	if (!contract) {
		return undefined;
	}

	if (contract.status === 'terminated') {
		return t.contracts.payments.terminatedNotice();
	}

	if (hasSatisfiedContractPaymentRequirement(contract.paidAmount, contract.expectedAmount)) {
		return t.contracts.payments.fullyPaidNotice();
	}

	return undefined;
}
