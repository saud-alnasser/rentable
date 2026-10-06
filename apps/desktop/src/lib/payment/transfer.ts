import type { Database } from '$lib/api/context';
import { refuse } from '$lib/api/refusal';
import * as s from '$lib/platform/database/schema';
import {
	PAYMENT_METHODS,
	PaymentSchema,
	type Payment,
	type PaymentMethod
} from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { formatDateInput, fromIsoDay } from '$lib/date';
import { areRefundsCovered, ensureContractIsNotTerminated, type PaymentLike } from '$lib/contract';
import { defineSheet, toContractReferences, toStatedNumber } from '$lib/transfer';
import { asc, eq, inArray } from 'drizzle-orm';
import z from 'zod';
import {
	ensurePaymentIsNotInTheFuture,
	ensureValidPaymentAmount,
	hasValidPaymentAmount,
	isPaymentInTheFuture
} from './payment';
import { toStoredText } from './serialize';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { ExportColumn } from '@rentable/design/csv.js';

/**
 * THE PAYMENTS SHEET
 *
 * what a workspace file holds of the payments, and how they are read back (`$lib/transfer`). A
 * payment names its contract by the contract's reference, which the file or the workspace has to
 * answer. It has no name of its own, so nothing names a payment.
 *
 * **A refund is a negative amount** (effort 854, requirement 30). A file written before refunds
 * holds none, so every row of it reads as money received. A build written before them refuses a
 * negative row by name rather than taking it in as received, which a separate direction column,
 * ignored by a reader that does not know it, would have done silently. Zero is still no payment.
 *
 * **What a person wrote beside the amount travels with it**: the method, the reference and the
 * note, each in a column a file may leave out, so a file without them imports as it always did.
 *
 * **A contract's ledger is written by these columns too** (`paymentLedgerColumns`), under the
 * headers its page shows, so the file a ledger exports is one this sheet reads back.
 */

/**
 * A payment, as a file holds one: its amount signed by its direction, and the method, the
 * reference and the note only where one was recorded, so a payment carrying none is the same three
 * keys a file written before them holds.
 */
export type TransferPayment = {
	contract: string;
	date: number;
	amount: number;
	method?: PaymentMethod;
	reference?: string;
	note?: string;
};

/**
 * a row of the sheet, as text, before it is a payment; its contract is the contract's reference,
 * and its own reference, the transfer or cheque number, is `paymentReference`.
 */
type PaymentRow = {
	reference: string;
	date: string;
	amount: string;
	method: string;
	paymentReference: string;
	note: string;
};

/** a stored amount signed by its direction, as a file holds it: a refund is money going out. */
function toSignedAmount(payment: Pick<Payment, 'amount' | 'direction'>) {
	return payment.direction === 'refund' ? -payment.amount : payment.amount;
}

/**
 * The columns a contract's ledger is exported with: what the rows belong to, then each payment
 * signed and spelled as the workspace's own payments sheet writes it (effort 854, requirement 30).
 * A refund is a negative amount and the method is the stored word, so a ledger exported here reads
 * back through the same import with every field a person entered.
 *
 * The contract and the tenant come first because a ledger read on screen sits under the contract's
 * own page and needs neither; the same rows in a file have left that page behind, and two ledgers
 * in one folder are indistinguishable without them. The contract is written as the reference a
 * workspace file calls it by (`toContractReferences`), which is what the import resolves it from:
 * its government number where it has one, and otherwise its tenant's national id and the day its
 * term started, spelled further where another contract shares both. The tenant is for the reader
 * and the import does not read it.
 */
export function paymentLedgerColumns(
	t: TranslationFunctions,
	reference: string,
	tenant: string
): ExportColumn<Payment>[] {
	return [
		{ header: t.common.labels.contract(), value: () => reference },
		{ header: t.common.labels.tenant(), value: () => tenant },
		{
			header: t.common.labels.paymentDate(),
			value: (payment) => ({ kind: 'date', value: new Date(payment.date) })
		},
		{
			header: t.common.labels.amount(),
			value: (payment) => ({
				kind: 'money',
				value: toSignedAmount(payment)
			})
		},
		{ header: t.contracts.payments.method(), value: (payment) => payment.method },
		{ header: t.contracts.payments.reference(), value: (payment) => payment.reference },
		{ header: t.contracts.payments.note(), value: (payment) => payment.note }
	];
}

/**
 * The method a cell names, `null` for an empty cell, and `undefined` for one naming no method.
 * Spelled as the schema stores it, which is what the export writes, in any case and with a space
 * for the hyphen.
 */
function toMethod(cell: string): PaymentMethod | null | undefined {
	const named = cell.trim().toLowerCase().replace(/\s+/g, '-');

	if (!named) {
		return null;
	}

	return PAYMENT_METHODS.find((method) => method === named);
}

/** the optional fields of a payment as a file holds them: each left out where nothing was recorded. */
function toRecorded(payment: {
	method?: PaymentMethod | null;
	reference?: string | null;
	note?: string | null;
}) {
	const reference = toStoredText(payment.reference);
	const note = toStoredText(payment.note);

	return {
		...(payment.method ? { method: payment.method } : {}),
		...(reference ? { reference } : {}),
		...(note ? { note } : {})
	};
}

/** the reference a file calls each contract by, by its id: every contract with a tenant. */
async function referencesOf(db: Database) {
	const contracts = await db
		.select({
			id: s.contract.id,
			govId: s.contract.govId,
			start: s.contract.start,
			end: s.contract.end,
			tenant: s.tenant.nationalId
		})
		.from(s.contract)
		.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

	// over every contract, as the contracts sheet composes them, so a payment names its contract
	// exactly as the contract's own row does.
	return toContractReferences(contracts);
}

export default defineSheet({
	concept: 'payments',
	order: 5,
	names: { written: 'Payments', accepted: ['payments', 'المدفوعات'] },
	view: 'viewPayment',
	columns: [
		{ header: 'Contract', value: (payment: TransferPayment) => payment.contract },
		{ header: 'Date', value: (payment) => ({ kind: 'date', value: new Date(payment.date) }) },
		{ header: 'Amount', value: (payment) => ({ kind: 'money', value: payment.amount }) },
		{ header: 'Method', value: (payment) => payment.method },
		{ header: 'Reference', value: (payment) => payment.reference },
		{ header: 'Note', value: (payment) => payment.note }
	],
	read: async (db): Promise<TransferPayment[]> => {
		const referenceOf = await referencesOf(db);
		const payments = await db
			.select({
				date: s.payment.date,
				amount: s.payment.amount,
				direction: s.payment.direction,
				method: s.payment.method,
				reference: s.payment.reference,
				note: s.payment.note,
				contractId: s.payment.contractId
			})
			.from(s.payment)
			.orderBy(asc(s.payment.date), asc(s.payment.id));

		// a payment whose contract is somehow missing is left out rather than written under an
		// empty reference: the import refuses a whole file over a reference nothing answers to,
		// and a workspace that could not be handed over because of a row nothing points at is
		// the worse failure.
		return payments.flatMap((payment) => {
			const contract = referenceOf.get(payment.contractId);

			return contract
				? [
						{
							contract,
							date: payment.date.getTime(),
							amount: toSignedAmount(payment),
							...toRecorded(payment)
						}
					]
				: [];
		});
	},
	// each payment's contract, day and amount, spelled exactly as a file spells them. A payment has
	// no name of its own, so what makes one recognisable is all three of its columns together, and
	// they are compared as the strings a file carries rather than as values, because that is what
	// the row being checked against them is: the day rather than the instant, and the figure
	// rather than a rendering of it. The figure is signed as the file signs it, so a refund of
	// 1000 is never taken for a payment of 1000.
	held: async (db) => {
		const referenceOf = await referencesOf(db);
		const payments = await db
			.select({
				date: s.payment.date,
				amount: s.payment.amount,
				direction: s.payment.direction,
				contractId: s.payment.contractId
			})
			.from(s.payment);

		return payments.map((payment) => [
			referenceOf.get(payment.contractId) ?? '',
			formatDateInput(payment.date),
			String(toSignedAmount(payment))
		]);
	},
	// a payment is identified by all three of its columns, and its rows may repeat: two payments of
	// the same amount against the same contract on the same day are two payments, while one matching
	// a payment already recorded is this file being read a second time. Doubling every payment in a
	// workspace is the failure that makes a transfer unusable.
	fields: [
		{ id: 'reference', headers: ['Contract', 'العقد', 'عقد'], required: true, identity: true },
		// a ledger is a statement of payments, so its own export calls the column `Payment Date`
		// where the transfer's sheet — which already sits under a tab saying Payments — calls it
		// `Date`.
		{
			id: 'date',
			headers: ['Date', 'التاريخ', 'Payment Date', 'تاريخ الدفع'],
			required: true,
			identity: true
		},
		{ id: 'amount', headers: ['Amount', 'المبلغ'], required: true, identity: true },
		// optional, so a file without them still reads, and outside the identity, so a file read a
		// second time is still turned away by contract, day and amount. The ledger's own export
		// calls the first `Payment Method`, as its interface does.
		{ id: 'method', headers: ['Method', 'طريقة الدفع', 'Payment Method'] },
		{ id: 'paymentReference', headers: ['Reference', 'المرجع'] },
		{ id: 'note', headers: ['Note', 'ملاحظة'] }
	],
	rowsMayRepeat: true,
	validate: (row: PaymentRow, now) => {
		const date = fromIsoDay(row.date);

		if (date === undefined) {
			return row.date;
		}

		// the same rule the write asserts, asked here so the two cannot answer differently.
		// Asserted only at the boundary, a file carrying one of these planned as importable and
		// was then refused whole at the write, naming no sheet and no row.
		if (isPaymentInTheFuture(date, now)) {
			return row.date;
		}

		const amount = toStatedNumber(row.amount);

		// the domain's own amount rule, called rather than restated, over the amount without its
		// sign: a negative one is a refund of it. Read here as `< 0`, this admitted a payment of
		// nothing, which `payments.create` refuses.
		if (amount === undefined || !hasValidPaymentAmount(Math.abs(amount))) {
			return row.amount;
		}

		return toMethod(row.method) === undefined ? row.method : undefined;
	},
	references: (row) => [
		{ concept: 'contracts', values: [row.reference], reference: row.reference.trim() }
	],
	toRecord: (row) => ({
		contract: row.reference.trim(),
		date: fromIsoDay(row.date) ?? 0,
		amount: toStatedNumber(row.amount) ?? 0,
		...toRecorded({
			method: toMethod(row.method),
			reference: row.paymentReference,
			note: row.note
		})
	}),
	// the amount signed, as the file holds it; the write splits it into what is stored and its
	// direction.
	input: PaymentSchema.pick({ date: true, amount: true, method: true }).extend({
		contract: z.string(),
		reference: z.string().optional(),
		note: z.string().optional()
	}),
	write: async (payments, writing) => {
		// the contracts this workspace already holds that are locked. A contract this file creates
		// is not one of them yet, even one the file says is terminated: the contracts sheet writes
		// every one as `active` and lands a termination at the end of the batch, after these
		// payments, so a terminated contract comes back terminated with its payments.
		const locked = await writing.db
			.select({ id: s.contract.id })
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
			.where(eq(s.contract.status, 'terminated'));
		const lockedContractIds = new Set(locked.map((contract) => contract.id));

		const rows = payments.map((payment) => {
			const direction = payment.amount < 0 ? ('refund' as const) : ('received' as const);
			const amount = Math.abs(payment.amount);
			// the payment domain's own rules, for the reason the contract's are asserted beside it:
			// this is the boundary, and a file is not exempt from what every other way of recording
			// a payment is held to. That includes the lock, which is the contract's rule rather than
			// the payment's: without it a file could put money on a contract `payments.create`
			// refuses, and `payments.delete` would then refuse to take it off again, because both
			// read the same lock. A refund is taken on a terminated contract, as it is by hand, and
			// what bounds it is weighed below over the whole file.
			const contractId = writing.resolve('contracts', payment.contract);

			if (direction === 'received') {
				ensureContractIsNotTerminated(lockedContractIds.has(contractId) ? 'terminated' : 'active');
			}

			ensureValidPaymentAmount(amount);
			ensurePaymentIsNotInTheFuture(payment.date, writing.now);

			return {
				id: newId(),
				date: new Date(payment.date),
				amount,
				direction,
				method: payment.method ?? null,
				reference: toStoredText(payment.reference) ?? null,
				note: toStoredText(payment.note) ?? null,
				contractId
			};
		});

		// what a contract returned stays within what it received, over what the workspace holds of
		// it and what the file adds together: the rule every refund recorded by hand is held to.
		// The refusal names the contract as the file wrote it, because a reader told that one of
		// several contracts was refused has nothing to act on.
		const refunded = [
			...new Set(rows.filter((row) => row.direction === 'refund').map((row) => row.contractId))
		];
		const held =
			refunded.length > 0
				? await writing.db
						.select({
							contractId: s.payment.contractId,
							amount: s.payment.amount,
							date: s.payment.date,
							direction: s.payment.direction
						})
						.from(s.payment)
						.where(inArray(s.payment.contractId, refunded))
				: [];

		for (const contractId of refunded) {
			const weighed: PaymentLike[] = [...held, ...rows].filter(
				(payment) => payment.contractId === contractId
			);

			if (!areRefundsCovered(weighed)) {
				const named = payments[rows.findIndex((row) => row.contractId === contractId)].contract;

				throw refuse('contract.refundsExceedReceivedNamed', { named: named.trim() });
			}
		}

		return {
			statements: rows.map((row) => writing.db.insert(s.payment).values(row)),
			count: rows.length,
			touched: { contractIds: rows.map((row) => row.contractId) }
		};
	}
});
