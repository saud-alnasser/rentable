import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import { PaymentSchema } from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { formatDateInput, fromIsoDay } from '$lib/date';
import { ensureContractIsNotTerminated } from '$lib/contract/contract';
import { defineSheet, toContractReference, toStatedNumber } from '$lib/transfer';
import { asc, eq } from 'drizzle-orm';
import z from 'zod';
import {
	ensurePaymentIsNotInTheFuture,
	ensureValidPaymentAmount,
	hasValidPaymentAmount,
	isPaymentInTheFuture
} from './payment';

/**
 * THE PAYMENTS SHEET
 *
 * what a workspace file holds of the payments, and how they are read back (`$lib/transfer`). A
 * payment names its contract by the contract's reference, which the file or the workspace has to
 * answer. It has no name of its own, so nothing names a payment.
 */

/** A payment, as a file holds one. */
export type TransferPayment = { contract: string; date: number; amount: number };

/** a row of the sheet, as text, before it is a payment; its contract is the contract's reference. */
type PaymentRow = { reference: string; date: string; amount: string };

/** the reference a file calls each contract by, by its id: every contract with a tenant. */
async function referencesOf(db: Database) {
	const contracts = await db
		.select({
			id: s.contract.id,
			govId: s.contract.govId,
			start: s.contract.start,
			tenant: s.tenant.nationalId
		})
		.from(s.contract)
		.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

	return new Map(contracts.map((contract) => [contract.id, toContractReference(contract)]));
}

export default defineSheet({
	concept: 'payments',
	order: 5,
	names: { written: 'Payments', accepted: ['payments', 'المدفوعات'] },
	view: 'viewPayment',
	columns: [
		{ header: 'Contract', value: (payment: TransferPayment) => payment.contract },
		{ header: 'Date', value: (payment) => ({ kind: 'date', value: new Date(payment.date) }) },
		{ header: 'Amount', value: (payment) => ({ kind: 'money', value: payment.amount }) }
	],
	read: async (db): Promise<TransferPayment[]> => {
		const referenceOf = await referencesOf(db);
		const payments = await db
			.select({
				date: s.payment.date,
				amount: s.payment.amount,
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

			return contract ? [{ contract, date: payment.date.getTime(), amount: payment.amount }] : [];
		});
	},
	// each payment's contract, day and amount, spelled exactly as a file spells them. A payment has
	// no name of its own, so what makes one recognisable is all three of its columns together, and
	// they are compared as the strings a file carries rather than as values, because that is what
	// the row being checked against them is: the day rather than the instant, and the figure
	// rather than a rendering of it.
	held: async (db) => {
		const referenceOf = await referencesOf(db);
		const payments = await db
			.select({ date: s.payment.date, amount: s.payment.amount, contractId: s.payment.contractId })
			.from(s.payment);

		return payments.map((payment) => [
			referenceOf.get(payment.contractId) ?? '',
			formatDateInput(payment.date),
			String(payment.amount)
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
		{ id: 'amount', headers: ['Amount', 'المبلغ'], required: true, identity: true }
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

		// the domain's own amount rule, called rather than restated. Read here as `< 0`, this
		// admitted a payment of nothing, which `payments.create` refuses.
		return amount === undefined || !hasValidPaymentAmount(amount) ? row.amount : undefined;
	},
	references: (row) => [
		{ concept: 'contracts', values: [row.reference], reference: row.reference.trim() }
	],
	toRecord: (row) => ({
		contract: row.reference.trim(),
		date: fromIsoDay(row.date) ?? 0,
		amount: toStatedNumber(row.amount) ?? 0
	}),
	input: PaymentSchema.pick({ date: true, amount: true }).extend({ contract: z.string() }),
	write: async (payments, writing) => {
		// the contracts this workspace already holds that are locked. A contract this file creates
		// cannot be one of them: the contracts sheet writes every one as `active` and lets
		// reconciliation derive the rest, which is also why a terminated contract does not survive
		// an export and a re-import as terminated.
		const locked = await writing.db
			.select({ id: s.contract.id })
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
			.where(eq(s.contract.status, 'terminated'));
		const lockedContractIds = new Set(locked.map((contract) => contract.id));

		const rows = payments.map((payment) => {
			// the payment domain's own rules, for the reason the contract's are asserted beside it:
			// this is the boundary, and a file is not exempt from what every other way of recording
			// a payment is held to. That includes the lock, which is the contract's rule rather than
			// the payment's: without it a file could put money on a contract `payments.create`
			// refuses, and `payments.delete` would then refuse to take it off again, because both
			// read the same lock.
			const contractId = writing.resolve('contracts', payment.contract);

			ensureContractIsNotTerminated(lockedContractIds.has(contractId) ? 'terminated' : 'active');
			ensureValidPaymentAmount(payment.amount);
			ensurePaymentIsNotInTheFuture(payment.date, writing.now);

			return { id: newId(), date: new Date(payment.date), amount: payment.amount, contractId };
		});

		return {
			statements: rows.map((row) => writing.db.insert(s.payment).values(row)),
			count: rows.length,
			touched: { contractIds: rows.map((row) => row.contractId) }
		};
	}
});
