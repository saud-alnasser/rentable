import { mayRun } from '$lib/design/acts';
import { declarePaymentActs, type PaymentActId, type PaymentActRecord } from '$lib/payment/acts';

/**
 * THE PAYMENT HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * The payment form and the payment's delete confirmation are mounted once, in the frame, by
 * `payment/component/host.svelte`, and asked for from places that share no parent: a card in a
 * contract's ledger, the payment's own page and the command menu. What they share is this
 * module-level rune state, the shape `contract/host.svelte.ts` set: a request is raised here and
 * the host answers it.
 */

/** A payment as the form edits it, or the details a new one starts from. */
export type PaymentFormValue = Omit<PaymentActRecord, 'id'> & { id?: string };

/** What a new payment starts with: the contract it is made against, which it cannot be without. */
export type PaymentPrefill = { contractId: string };

type PaymentHostState = {
	/**
	 * the form, where one is open: the payment it opens on, and the contract it writes to. `key`
	 * changes on every opening and every closing, so a form opened a second time does not open on
	 * what was typed into the first. The contract is kept on closing, so the form stays mounted
	 * rather than reading a contract that is not there.
	 */
	form: { open: boolean; key: number; contractId?: string; value?: PaymentFormValue };
	/** the one payment being asked about. */
	deleting: PaymentActRecord | null;
	/** the payment whose details are on their way to the clipboard. */
	copying: PaymentActRecord | null;
	/** an act asked for by a payment's identity alone, from the command menu. */
	asked: { actId: string; paymentId: string } | null;
	/** a new payment asked for, answered once its contract is read and found to take one. */
	creating: PaymentPrefill | null;
};

export const paymentHostState = $state<PaymentHostState>({
	form: { open: false, key: 0 },
	deleting: null,
	copying: null,
	asked: null,
	creating: null
});

function openForm(contractId: string, value?: PaymentFormValue) {
	paymentHostState.form = { contractId, value, open: true, key: paymentHostState.form.key + 1 };
}

/** Open the form on a new payment against a contract the host has found takes one. */
export function openNewPaymentForm(contractId: string) {
	openForm(contractId);
}

/** The form was dismissed: it goes, and the next opening starts on a clean draft. */
export function closePaymentForm() {
	paymentHostState.form = {
		open: false,
		key: paymentHostState.form.key + 1,
		contractId: paymentHostState.form.contractId
	};
}

/** The confirmation was dismissed, or answered. */
export function closePaymentConfirmation() {
	paymentHostState.deleting = null;
}

/** Every payment act, bound to this host. The one list every surface projects. */
export const paymentActs = declarePaymentActs({
	copyDetails: (payment) => {
		paymentHostState.copying = payment;
	},
	// a reference names one transfer or cheque and a note is about one payment, so a duplicate
	// starts without either rather than claiming the original's; how it was paid carries over.
	duplicate: (payment) =>
		openForm(payment.contractId, { ...payment, id: undefined, reference: null, note: null }),
	edit: (payment) => openForm(payment.contractId, payment),
	confirmDelete: (payment) => {
		paymentHostState.deleting = payment;
	}
});

export const paymentHost = {
	/**
	 * run one act on a payment the caller holds. An act the payment does not admit is not run, and
	 * the answer says whether it was.
	 */
	run(actId: PaymentActId, payment: PaymentActRecord) {
		const act = paymentActs.find((declared) => declared.id === actId);

		if (!mayRun(act, payment)) {
			return false;
		}

		act.run(payment);

		return true;
	},
	/** run one act on a payment named by its identity alone; the host reads the rest. */
	runOn(actId: string, paymentId: string) {
		paymentHostState.asked = { actId, paymentId };
	},
	/**
	 * open the form on a new payment against the contract named, where the contract takes one; the
	 * host answers with the create act's reason where it does not.
	 */
	create(prefill: PaymentPrefill) {
		paymentHostState.creating = prefill;
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetPaymentHost() {
	paymentHostState.form = { open: false, key: paymentHostState.form.key + 1 };
	paymentHostState.deleting = null;
	paymentHostState.copying = null;
	paymentHostState.asked = null;
	paymentHostState.creating = null;
}
