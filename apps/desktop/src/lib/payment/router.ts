import { FILTER_PERIODS } from '$lib/api/period';
import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { isPaymentWithinPeriod } from '$lib/payment/period';
import { ensureIdFree, newId } from '$lib/platform/database/identity';
import { matchesAnySearch } from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { PaymentSchema, type Payment } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable
} from '$lib/contract/contract';
import type { Database } from '$lib/api/context';
import { reconcileTouched } from '$lib/contract/reconcile';
import {
	ensurePaymentIsNotInTheFuture,
	ensureValidPaymentAmount,
	groupPaymentsByContractId,
	whatRefusesPaymentDeletion,
	type PaymentRefusalReason
} from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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

type DbPayment = typeof s.payment.$inferSelect;

/**
 * A payment that would be turned away, and why.
 *
 * The amount rather than a name, because a payment has none: the ledger knows one by what it was
 * for, and rendering that is the surface's, since only the surface knows the reader's locale.
 */
type PaymentRefusal = { id: string; amount: number; reason: PaymentRefusalReason };

/**
 * What deleting a whole selection of payments would do, from one read of the workspace.
 *
 * **The plan and the mutation are the same call.** `payments.planMany` and `payments.deleteMany`
 * both go through this, so the confirmation shows what the deletion is about to decide rather
 * than a second opinion about it. They can still disagree about the *workspace*, because another
 * device may write between the two, and that is why the mutation runs this again instead of
 * trusting what the reader was shown. A contract terminated between the two is the case this
 * list actually meets: the ledger hides its controls on a terminated contract, so the only way
 * to reach that refusal from here is for the termination to arrive while the dialog is open.
 *
 * One read per table for the whole selection, never one per record.
 */
async function planPaymentSelection(db: Database, ids: readonly string[]) {
	const named = [...new Set(ids)];

	const existing = await db.select().from(s.payment).where(inArray(s.payment.id, named));
	const paymentsById = new Map(existing.map((payment) => [payment.id, payment]));

	const contractIds = [...new Set(existing.map((payment) => payment.contractId))];
	const contracts = contractIds.length
		? await db
				.select({ id: s.contract.id, status: s.contract.status })
				.from(s.contract)
				.where(inArray(s.contract.id, contractIds))
		: [];
	const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));

	const eligible: DbPayment[] = [];
	const refused: PaymentRefusal[] = [];

	// walked in the order the reader named them, so what the confirmation lists reads the way the
	// selection does rather than the way the engine happened to answer.
	for (const id of named) {
		const payment = paymentsById.get(id);
		// a payment is reached only through its contract, so one whose contract is not there is
		// one no surface can show and nobody selected. It joins the payments that are not there,
		// rather than earning a reason of its own that nothing can produce.
		const contract = payment ? contractsById.get(payment.contractId) : undefined;

		if (!payment || !contract) {
			refused.push({ id, amount: 0, reason: 'missing' });

			continue;
		}

		const reason = whatRefusesPaymentDeletion(contract.status);

		if (reason) {
			refused.push({ id, amount: payment.amount, reason });
		} else {
			eligible.push(payment);
		}
	}

	return { eligible, refused };
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
	get: procedure.member.input(PaymentSchema.pick({ id: true })).query(async ({ input, ctx }) => {
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
	search: procedure.member
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
	getMany: procedure.member
		.input(
			PaymentSchema.pick({ contractId: true }).extend({
				search: z.string().optional(),
				/**
				 * narrows the statement to one span of time, from the vocabulary two surfaces
				 * share. It is a `where` and not a pass over the result: a period answers *what was
				 * paid then*, and a question about what exists cannot be answered by shortening
				 * what was already fetched ([[rules/data]], under *List reads*).
				 */
				period: z.enum(FILTER_PERIODS).optional()
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
						input.period ? isPaymentWithinPeriod(input.period, ctx.clock.now()) : undefined
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
	create: procedure.member
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
					id: input.id ?? newId(),
					date: new Date(input.date)
				})
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [contract.id] });

			return serializePayment(created);
		}),

	update: procedure.member
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

	delete: procedure.member
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
		}),

	/**
	 * What deleting the payments named would do, before any of it is done.
	 *
	 * A ledger row carries everything the reader sees and still cannot answer this: what locks a
	 * payment is its contract's status, which the row does not hold. It is asked the same way
	 * every other list asks, which is the point of asking at all.
	 *
	 * A query rather than a mutation: it reads and writes nothing.
	 */
	planMany: procedure.member
		.input(z.object({ ids: z.array(PaymentSchema.shape.id).min(1) }))
		.query(async ({ input, ctx }) => {
			const plan = await planPaymentSelection(ctx.db, input.ids);

			return { eligible: plan.eligible.map((payment) => payment.id), refused: plan.refused };
		}),

	/**
	 * Delete every payment named whose contract is not locked, and say which could not go.
	 *
	 * **One delete over the whole set, not one per record.** A selection is one thing the reader
	 * asked for, and issuing it as N calls costs a round trip and a reconcile pass per record for
	 * work one statement and one pass do.
	 *
	 * **One reconcile pass, over every contract the set touched.** A payment is what a contract's
	 * paid amount and its derived status are computed from, so removing one moves both. Today
	 * every selection comes off one contract's ledger and the union has one member; the union is
	 * what is passed anyway, because the procedure is not the surface and should not depend on
	 * where its ids came from.
	 */
	deleteMany: procedure.member
		.use(autosync())
		.input(z.object({ ids: z.array(PaymentSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planPaymentSelection(ctx.db, input.ids);
			const deletableIds = plan.eligible.map((payment) => payment.id);

			if (deletableIds.length) {
				await ctx.db.delete(s.payment).where(inArray(s.payment.id, deletableIds));
				await reconcileTouched(ctx.db, now, {
					contractIds: [...new Set(plan.eligible.map((payment) => payment.contractId))]
				});
			}

			return { deleted: plan.eligible.map(serializePayment), refused: plan.refused };
		}),

	/**
	 * Put a set of payments back, all of them or none.
	 *
	 * What undoing {@link deleteMany} calls, and the reason it is all or nothing: a set half
	 * restored leaves the workspace in a shape neither the deletion nor the undo describes. One
	 * batch, and the boundary runs a batch inside one transaction (ADR 0027), so a refusal
	 * anywhere in the set creates nothing.
	 *
	 * **It throws rather than reporting**, which is what leaves the entry on the undo stack: an
	 * inverse that threw did not move the workspace, so the reader can deal with whatever refused
	 * it and press undo again.
	 *
	 * **The paid-in-full gate is asked once for the whole set, not once per payment.** `create`
	 * asks it of one arriving payment against what the contract already holds; asking that of
	 * each member in turn would refuse the second half of any set whose first half satisfies the
	 * contract, which is exactly the set an undo of *these payments took it out of paid-in-full*
	 * is made of. One question, before any of them goes in: may payments be added to this
	 * contract at all right now.
	 */
	createMany: procedure.member
		.use(autosync())
		.input(z.object({ payments: z.array(PaymentSchema.partial({ id: true })).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const named = input.payments.map((payment) => ({ ...payment, id: payment.id ?? newId() }));
			const ids = named.map((payment) => payment.id);

			// the set against itself before it is weighed against the workspace at all. A set that
			// contradicts itself is a contradiction the engine would only report part-way through,
			// and this write is meant to land whole or not at all.
			const repeated = ids.find((id, index) => ids.indexOf(id) !== index);

			if (repeated) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `two payments in this set claim ${repeated}`
				});
			}

			const held = await ctx.db.select().from(s.payment).where(inArray(s.payment.id, ids));

			ensureIdFree(held[0], held[0]?.id);

			const contractIds = [...new Set(named.map((payment) => payment.contractId))];
			const contracts = await ctx.db
				.select()
				.from(s.contract)
				.where(inArray(s.contract.id, contractIds));
			const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
			const absent = contractIds.find((contractId) => !contractsById.has(contractId));

			if (absent) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'contract does not exist' });
			}

			const registered = await ctx.db
				.select()
				.from(s.payment)
				.where(inArray(s.payment.contractId, contractIds));
			const registeredByContractId = groupPaymentsByContractId(registered);

			for (const contract of contracts) {
				ensureContractIsNotTerminated(contract.status);
				ensureContractPaymentsCreatable(contract, registeredByContractId.get(contract.id) ?? []);
			}

			for (const payment of named) {
				ensureValidPaymentAmount(payment.amount);
				ensurePaymentIsNotInTheFuture(payment.date, now);
			}

			const [first, ...rest] = named.map((payment) =>
				ctx.db
					.insert(s.payment)
					.values({ ...payment, date: new Date(payment.date) })
					.returning()
			);
			const created = await ctx.db.batch([first, ...rest]);

			await reconcileTouched(ctx.db, now, { contractIds });

			return created.map(([payment]) => serializePayment(payment));
		})
});
