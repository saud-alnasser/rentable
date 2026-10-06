import { FILTER_PERIODS, isWithinPeriod } from '$lib/date';
import { ensureIdFree } from '$lib/api/refusal';
import { newId } from '$lib/platform/database/identity';
import {
	matchesAnySearch,
	RecordSearchSchema,
	type RecordMatch
} from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { PaymentSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable,
	ensureRefundsCovered,
	ensureRefundWithinLimit,
	reconcileTouched
} from '$lib/contract';
import { allocateReceipt, toReceiptReference } from '$lib/payment/receipt';
import {
	ensurePaymentIsNotInTheFuture,
	ensureValidPaymentAmount,
	PAYMENT_SORT_COLUMN_IDS
} from '$lib/payment/payment';
import { serializePayment, toStoredText } from '$lib/payment/serialize';
import { permits, type Flag } from '@rentable/workspace-permission';
import { and, asc, desc, eq, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';
import selection from './selection/router';

/**
 * PAYMENT ROUTER
 *
 * the payment procedures, mounted at the root at `payment`. A payment is only ever made against a
 * contract, and *the router was mounted by the contract router, at `contract.payments`, until
 * effort 840 flattened the router tree.* What a selection of payments is asked is composed in at
 * the root from `selection/router.ts`.
 */

// the day a payment was made, as the text a search runs against. A stored date is epoch
// milliseconds, which no reader would type, so the comparison is made against the calendar
// day it stands for — in UTC, which is the zone every date here is held in.
const paymentDay = sql<string>`strftime('%Y-%m-%d', ${s.payment.date} / 1000, 'unixepoch')`;

// every field the ledger can be searched by, whether or not the row shows it — a field
// dropped from a surface is never dropped from search. The comparison itself is the shared
// one, so a term folds and a column folds the same way here as everywhere else. The reference is
// the number a bank statement or a SADAD bill names a payment by, so it is what one is looked for
// by, and it folds: a reader may type its digits in either locale's spelling.
const PAYMENT_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [
	s.payment.amount,
	paymentDay,
	s.payment.reference
];

const PaymentSortSchema = z.object({
	columnId: z.enum(PAYMENT_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

/**
 * A ledger's order: the one chosen, then the statement's own, newest first.
 *
 * Two payments made on one day are told apart by which was recorded later, and two of one amount
 * by which was made later, so the order stays total whatever the reader chose.
 */
function paymentOrderBy(sort: z.infer<typeof PaymentSortSchema> | undefined): SQL[] {
	const statementOrder = [desc(s.payment.date), desc(s.payment.id)];

	if (!sort) {
		return statementOrder;
	}

	const column = sort.columnId === 'date' ? s.payment.date : s.payment.amount;
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	if (sort.columnId === 'date') {
		return [chosen, sort.direction === 'asc' ? asc(s.payment.id) : desc(s.payment.id)];
	}

	return [chosen, ...statementOrder];
}

export default router({
	/**
	 * One payment, carrying the contract it was made against and whose tenant holds it.
	 *
	 * A payment is reached only through its contract, so a view of one that could not name
	 * that contract would leave the reader with three figures and no way back. The contract's
	 * fields are left out for a member who may not view contracts, and the tenant's for one who
	 * may not view tenants (effort 838, requirement 10); the id stays, since it is the payment's
	 * own column.
	 */
	get: procedure
		.permitted('viewPayment')
		.input(PaymentSchema.pick({ id: true }))
		.query(async ({ input, ctx }) => {
			const row = await ctx.db
				.select({
					payment: s.payment,
					contractGovId: s.contract.govId,
					contractStatus: s.contract.status,
					contractPaidAmount: s.contract.paidAmount,
					contractExpectedAmount: s.contract.expectedAmount,
					tenantName: s.tenant.name
				})
				.from(s.payment)
				.innerJoin(s.contract, eq(s.payment.contractId, s.contract.id))
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(eq(s.payment.id, input.id))
				.get();

			if (!row) {
				return undefined;
			}

			return {
				...serializePayment(row.payment),
				...(permits(ctx.identity.permissions, 'viewContract')
					? {
							contractGovId: row.contractGovId ?? '',
							contractStatus: row.contractStatus,
							contractPaidAmount: row.contractPaidAmount,
							contractExpectedAmount: row.contractExpectedAmount
						}
					: {}),
				...(permits(ctx.identity.permissions, 'viewTenant') ? { tenantName: row.tenantName } : {})
			};
		}),

	/**
	 * Everything a payment's receipt states, read in one go for the page that prints it: the
	 * payment as it stands, who paid it, the contract and the units it was for, the cycles it
	 * covers and what remains of the contract's total cost after it.
	 *
	 * The cycles and the remainder come from the allocation over every payment of the contract,
	 * because what one payment covers depends on each payment taken before it. Computed on every
	 * read and stored nowhere, so a payment edited and printed again gives the edited receipt. It
	 * is a read, so a terminated contract's payments have receipts too.
	 *
	 * **What the member may not view is left off the receipt** (effort 838, requirement 10): who
	 * paid without `viewTenant`, the contract and what remains of it without `viewContract`, the
	 * units without `viewUnit`, and the complex holding each without `viewComplex`. The cycles are
	 * the payment's, what it covers, and stay.
	 */
	receipt: procedure
		.permitted('viewPayment')
		.input(PaymentSchema.pick({ id: true }))
		.query(async ({ input, ctx }) => {
			const row = await ctx.db
				.select({ payment: s.payment, contract: s.contract, tenant: s.tenant })
				.from(s.payment)
				.innerJoin(s.contract, eq(s.payment.contractId, s.contract.id))
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(eq(s.payment.id, input.id))
				.get();

			if (!row) {
				throw refuse('payment.missing');
			}

			const views = (flag: Flag) => permits(ctx.identity.permissions, flag);

			const [payments, units] = await Promise.all([
				ctx.db.select().from(s.payment).where(eq(s.payment.contractId, row.contract.id)),
				!views('viewUnit')
					? undefined
					: ctx.db
							.select({ name: s.unit.name, complexName: s.complex.name })
							.from(s.contractUnit)
							.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
							.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
							.where(eq(s.contractUnit.contractId, row.contract.id))
							.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id))
			]);

			const { cycles, remaining } = allocateReceipt(
				row.contract,
				payments,
				row.payment.id,
				ctx.clock.now()
			);

			return {
				reference: toReceiptReference(row.payment.id),
				payment: serializePayment(row.payment),
				...(views('viewTenant')
					? { tenant: { name: row.tenant.name, nationalId: row.tenant.nationalId } }
					: {}),
				...(views('viewContract')
					? {
							contract: {
								govId: row.contract.govId ?? '',
								start: row.contract.start.getTime(),
								end: row.contract.end.getTime()
							},
							remaining
						}
					: {}),
				...(units
					? {
							units: units.map(({ name, complexName }) =>
								views('viewComplex') ? { name, complexName } : { name }
							)
						}
					: {}),
				// cycles cross as timestamps, as a contract's dates do.
				cycles: cycles.map((cycle) => ({ index: cycle.index, due: cycle.due.getTime() }))
			};
		}),

	/**
	 * The payments a palette search reaches, by amount, by the day they were made, or by a part
	 * of their reference.
	 *
	 * A payment has no name, so its handle is the amount as it is stored — the surface showing
	 * it is what renders that in the reader's locale — and what places it is the contract it
	 * was made against, which is also the only way back to it. Its direction crosses beside the
	 * amount, so the surface names a refund as one (effort 854, requirement 25). The contract's
	 * reference and its
	 * tenant are each shown only to a member who may view their kind (effort 838, requirement 10).
	 */
	search: procedure
		.permitted('viewPayment')
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<(RecordMatch & Pick<s.Payment, 'direction'>)[]> => {
			const rows = await ctx.db
				.select({
					id: s.payment.id,
					amount: s.payment.amount,
					direction: s.payment.direction,
					contractGovId: s.contract.govId,
					tenantName: s.tenant.name
				})
				.from(s.payment)
				.innerJoin(s.contract, eq(s.payment.contractId, s.contract.id))
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(matchesAnySearch(PAYMENT_SEARCH_COLUMNS, input.term))
				.orderBy(desc(s.payment.date), desc(s.payment.id))
				.limit(input.limit);

			const viewsContract = permits(ctx.identity.permissions, 'viewContract');
			const viewsTenant = permits(ctx.identity.permissions, 'viewTenant');

			return rows.map((row) => ({
				id: row.id,
				label: String(row.amount),
				direction: row.direction,
				hint: (viewsContract ? row.contractGovId : null) ?? (viewsTenant ? row.tenantName : '')
			}));
		}),

	/**
	 * A contract's payments, in one bounded query: the whole result set for a search, newest
	 * first unless an order is chosen, so the ledger can read that order to place its month
	 * headers.
	 *
	 * `search` matches an amount, or the payment's calendar day written as `2026-03-20` — a
	 * prefix of it, `2026-03`, selects a month. It is the stored day rather than the date the
	 * row displays: the display date is localized, and no locale's rendering of it exists in
	 * the database to compare against. It also matches any part of the reference.
	 */
	getMany: procedure
		.permitted('viewPayment')
		.input(
			PaymentSchema.pick({ contractId: true }).extend({
				search: z.string().optional(),
				/**
				 * narrows the statement to one span of time, from the vocabulary two surfaces
				 * share. It is a `where` and not a pass over the result: a period answers *what was
				 * paid then*, and a question about what exists cannot be answered by shortening
				 * what was already fetched ([[rules/data]], under *List reads*).
				 */
				period: z.enum(FILTER_PERIODS).optional(),
				/** the order the reader chose, or the statement's own, newest first. */
				sort: PaymentSortSchema.optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();
			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(
					and(
						eq(s.payment.contractId, input.contractId),
						search ? matchesAnySearch(PAYMENT_SEARCH_COLUMNS, search) : undefined,
						// the same condition the landing screen's collected figure is read with, which
						// is what makes the two agree rather than merely intend to. The clock comes
						// from the context, so a test can ask what *last month* means on a chosen day.
						input.period ? isWithinPeriod(s.payment.date, input.period, ctx.clock.now()) : undefined
					)
				)
				// a statement reads newest first unless the reader chose otherwise, and every order
				// carries a tie-break, so two renders of the same ledger cannot disagree.
				.orderBy(...paymentOrderBy(input.sort));

			return payments.map(serializePayment);
		}),

	// an optional id, so undoing a deletion can put the row back with the identity it had — a
	// page still open on that record is holding a reference to it (ADR 0026). Absent otherwise,
	// and the engine assigns one.
	//
	// a direction, so a refund is recorded here too (effort 854, requirements 25 and 26). A refund
	// is taken on any contract, a terminated one included, and the paid-in-full gate is not its:
	// what bounds it is the most the contract's state lets it return. An undo putting a deleted
	// refund back comes through here with its id and is weighed against that limit again.
	create: procedure
		.permitted('createPayment')
		.use(autosync())
		.input(PaymentSchema.partial({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			ensureIdFree(
				input.id === undefined
					? undefined
					: await ctx.db.select().from(s.payment).where(eq(s.payment.id, input.id)).get()
			);

			const contract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.contractId))
				.get();

			if (!contract) {
				throw refuse('contract.missing');
			}

			const registered = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, contract.id));

			if (input.direction === 'refund') {
				ensureRefundWithinLimit(contract, registered, input.amount);
			} else {
				ensureContractIsNotTerminated(contract.status);
				ensureContractPaymentsCreatable(contract, registered);
			}

			ensureValidPaymentAmount(input.amount);
			ensurePaymentIsNotInTheFuture(input.date, now);

			const created = await ctx.db
				.insert(s.payment)
				.values({
					...input,
					id: input.id ?? newId(),
					date: new Date(input.date),
					reference: toStoredText(input.reference),
					note: toStoredText(input.note)
				})
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [contract.id] });

			return serializePayment(created);
		}),

	update: procedure
		.permitted('editPayment')
		.use(autosync())
		// every field the payment's form sets, so the inverse an undo replays through here puts all of
		// them back rather than the date and the amount alone.
		.input(
			PaymentSchema.pick({
				id: true,
				date: true,
				amount: true,
				method: true,
				reference: true,
				note: true
			})
		)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingPayment = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.id, input.id))
				.get();

			if (!existingPayment) {
				throw refuse('payment.missing');
			}

			const contract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, existingPayment.contractId))
				.get();

			if (!contract) {
				throw refuse('contract.missing');
			}

			ensureValidPaymentAmount(input.amount);
			ensurePaymentIsNotInTheFuture(input.date, now);

			// every other row the contract holds, which is what this one is weighed against: the edit
			// replaces it rather than adding to it. The direction is the stored one, since the input
			// carries none, so an edit never turns a payment into a refund or back.
			const others = (
				await ctx.db.select().from(s.payment).where(eq(s.payment.contractId, contract.id))
			).filter((payment) => payment.id !== existingPayment.id);

			if (existingPayment.direction === 'refund') {
				// a refund is edited in place on a terminated contract too, within its limit.
				ensureRefundWithinLimit(contract, others, input.amount);
			} else {
				ensureContractIsNotTerminated(contract.status);
				ensureRefundsCovered([...others, { ...existingPayment, amount: input.amount }]);
			}

			const updated = await ctx.db
				.update(s.payment)
				.set({
					date: new Date(input.date),
					amount: input.amount,
					method: input.method,
					reference: toStoredText(input.reference),
					note: toStoredText(input.note)
				})
				.where(eq(s.payment.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [contract.id] });

			return serializePayment(updated);
		}),

	delete: procedure
		.permitted('deletePayment')
		.use(autosync())
		.input(PaymentSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingPayment = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.id, input.id))
				.get();

			// one somebody else deleted first is refused rather than answered with nothing, which read
			// as success: to an undo of its creation, and to a deletion of what is already gone.
			if (!existingPayment) {
				throw refuse('payment.missing');
			}

			const contract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, existingPayment.contractId))
				.get();

			if (!contract) {
				throw refuse('contract.missing');
			}

			// a refund goes on any contract, which is also what lets the undo of recording one work on
			// a terminated contract. A payment received is locked there, and on a live contract it
			// goes only while what is left still covers the refunds.
			if (existingPayment.direction !== 'refund') {
				ensureContractIsNotTerminated(contract.status);
				ensureRefundsCovered(
					(
						await ctx.db.select().from(s.payment).where(eq(s.payment.contractId, contract.id))
					).filter((payment) => payment.id !== existingPayment.id)
				);
			}

			const deleted = await ctx.db
				.delete(s.payment)
				.where(eq(s.payment.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [contract.id] });

			return deleted ? serializePayment(deleted) : deleted;
		}),

	...selection._def.record
});
