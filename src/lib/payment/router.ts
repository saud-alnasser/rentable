import * as s from '$lib/api/database/schema';
import { PaymentSchema, type Payment } from '$lib/api/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { PaginationSchema, resolvePagination, toPaginatedResult } from '$lib/api/utils/pagination';
import {
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable
} from '$lib/contract/contract';
import { reconcile } from '$lib/contract/reconcile';
import { ensureValidPaymentAmount } from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
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

const paymentSearchDateFormatter = new Intl.DateTimeFormat('en-GB', {
	dateStyle: 'medium',
	timeZone: 'UTC'
});

function matchesPaymentSearch(payment: Payment, search: string) {
	return [String(payment.amount), paymentSearchDateFormatter.format(new Date(payment.date))].some(
		(value) => value.toLowerCase().includes(search)
	);
}

export default router({
	getMany: procedure.public
		.input(PaymentSchema.pick({ contractId: true }))
		.query(async ({ input, ctx }) => {
			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, input.contractId));

			return payments.map(serializePayment);
		}),

	getPaginated: procedure.public
		.input(PaginationSchema.extend({ contractId: z.number(), search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const { limit, offset } = resolvePagination(input);
			const search = input.search?.trim().toLowerCase();

			if (search) {
				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, input.contractId))
					.orderBy(asc(s.payment.id));
				const serializedPayments = payments.map(serializePayment);

				return toPaginatedResult(
					serializedPayments.filter((payment) => matchesPaymentSearch(payment, search)),
					limit,
					offset
				);
			}

			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, input.contractId))
				.orderBy(asc(s.payment.id))
				.limit(limit + 1)
				.offset(offset);

			return toPaginatedResult(payments.map(serializePayment), limit, offset);
		}),

	create: procedure.public
		.use(autosync())
		.input(PaymentSchema.omit({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

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

			const created = await ctx.db
				.insert(s.payment)
				.values({
					...input,
					date: new Date(input.date)
				})
				.returning()
				.get();

			await reconcile(ctx.db, now);

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

			const updated = await ctx.db
				.update(s.payment)
				.set({
					date: new Date(input.date),
					amount: input.amount
				})
				.where(eq(s.payment.id, input.id))
				.returning()
				.get();

			await reconcile(ctx.db, now);

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

			await reconcile(ctx.db, now);

			return deleted ? serializePayment(deleted) : deleted;
		})
});
