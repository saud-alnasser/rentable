import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { ensureIdFree } from '$lib/platform/database/identity';
import { matchesAnySearch } from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { PaymentSchema, type Payment } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable
} from '$lib/contract/contract';
import { reconcileTouched } from '$lib/contract/reconcile';
import { ensurePaymentIsNotInTheFuture, ensureValidPaymentAmount } from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';

/**
 * PAYMENT ROUTER
 *
 * the payment procedures, mounted by the contract router at `contract.payments` — a
 * payment is only ever reached through the contract it was made against.
 */

function serializePayment(record: typeof s.payment.$inferSelect): Payment {
	return {
		id: record.id,
		date: record.date.getTime(),
		amount: record.amount,
		contractId: record.contractId
	};
}

// the day a payment was made, as the text a search runs against. A stored date is epoch
// milliseconds, which no reader would type, so the comparison is made against the calendar
// day it stands for — in UTC, which is the zone every date here is held in.
const paymentDay = sql<string>`strftime('%Y-%m-%d', ${s.payment.date} / 1000, 'unixepoch')`;

// every field the ledger can be searched by, whether or not the row shows it — a field
// dropped from a surface is never dropped from search. The comparison itself is the shared
// one, so a term folds and a column folds the same way here as everywhere else.
const PAYMENT_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [s.payment.amount, paymentDay];

export default router({
	/**
	 * One payment, carrying the contract it was made against and whose tenant holds it.
	 *
	 * A payment is reached only through its contract, so a view of one that could not name
	 * that contract would leave the reader with three figures and no way back.
	 */
	get: procedure.public.input(PaymentSchema.pick({ id: true })).query(async ({ input, ctx }) => {
		const row = await ctx.db
			.select({
				payment: s.payment,
				contractGovId: s.contract.govId,
				contractStatus: s.contract.status,
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
			contractGovId: row.contractGovId ?? '',
			contractStatus: row.contractStatus,
			tenantName: row.tenantName
		};
	}),

	/**
	 * The payments a palette search reaches, by amount or by the day they were made.
	 *
	 * A payment has no name, so its handle is the amount as it is stored — the surface showing
	 * it is what renders that in the reader's locale — and what places it is the contract it
	 * was made against, which is also the only way back to it.
	 */
	search: procedure.public
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			const rows = await ctx.db
				.select({
					id: s.payment.id,
					amount: s.payment.amount,
					contractGovId: s.contract.govId,
					tenantName: s.tenant.name
				})
				.from(s.payment)
				.innerJoin(s.contract, eq(s.payment.contractId, s.contract.id))
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(matchesAnySearch(PAYMENT_SEARCH_COLUMNS, input.term))
				.orderBy(desc(s.payment.date), desc(s.payment.id))
				.limit(input.limit);

			return rows.map((row) => ({
				id: row.id,
				label: String(row.amount),
				hint: row.contractGovId ?? row.tenantName
			}));
		}),

	/**
	 * A contract's payments, in one bounded query: the whole result set for a search, newest
	 * first, so the ledger can read that order to place its month headers.
	 *
	 * `search` matches an amount, or the payment's calendar day written as `2026-03-20` — a
	 * prefix of it, `2026-03`, selects a month. It is the stored day rather than the date the
	 * row displays: the display date is localized, and no locale's rendering of it exists in
	 * the database to compare against.
	 */
	getMany: procedure.public
		.input(PaymentSchema.pick({ contractId: true }).extend({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();
			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(
					and(
						eq(s.payment.contractId, input.contractId),
						search ? matchesAnySearch(PAYMENT_SEARCH_COLUMNS, search) : undefined
					)
				)
				// a statement reads newest first, and two payments made on one day are told apart
				// by which was recorded later — without that tie-break the order is not total, and
				// two renders of the same ledger may disagree.
				.orderBy(desc(s.payment.date), desc(s.payment.id));

			return payments.map(serializePayment);
		}),

	// an optional id, so undoing a deletion can put the row back with the identity it had — a
	// page still open on that record is holding a reference to it (ADR 0026). Absent otherwise,
	// and the engine assigns one.
	create: procedure.public
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			const registered = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, contract.id));

			ensureContractIsNotTerminated(contract.status);
			ensureContractPaymentsCreatable(contract, registered);
			ensureValidPaymentAmount(input.amount);
			ensurePaymentIsNotInTheFuture(input.date, now);

			const created = await ctx.db
				.insert(s.payment)
				.values({
					...input,
					date: new Date(input.date)
				})
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [contract.id] });

			return serializePayment(created);
		}),

	update: procedure.public
		.use(autosync())
		.input(PaymentSchema.pick({ id: true, date: true, amount: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingPayment = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.id, input.id))
				.get();

			if (!existingPayment) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'payment does not exist'
				});
			}

			const contract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, existingPayment.contractId))
				.get();

			if (!contract) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			ensureContractIsNotTerminated(contract.status);
			ensureValidPaymentAmount(input.amount);
			ensurePaymentIsNotInTheFuture(input.date, now);

			const updated = await ctx.db
				.update(s.payment)
				.set({
					date: new Date(input.date),
					amount: input.amount
				})
				.where(eq(s.payment.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [contract.id] });

			return serializePayment(updated);
		}),

	delete: procedure.public
		.use(autosync())
		.input(PaymentSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingPayment = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.id, input.id))
				.get();

			if (!existingPayment) {
				return existingPayment;
			}

			const contract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, existingPayment.contractId))
				.get();

			if (!contract) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			ensureContractIsNotTerminated(contract.status);

			const deleted = await ctx.db
				.delete(s.payment)
				.where(eq(s.payment.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [contract.id] });

			return deleted ? serializePayment(deleted) : deleted;
		})
});
