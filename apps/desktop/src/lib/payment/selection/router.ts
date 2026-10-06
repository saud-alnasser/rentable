import { ensureIdFree } from '$lib/api/refusal';
import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { PaymentSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import { areRefundsCovered, reconcileTouched } from '$lib/contract';
import type { Database } from '$lib/api/context';
import {
	ensurePaymentIsNotInTheFuture,
	ensurePaymentWritable,
	ensureValidPaymentAmount,
	groupPaymentsByContractId,
	whatRefusesPaymentDeletion,
	type PaymentRefusalReason
} from '$lib/payment/payment';
import { serializePayment, toStoredText } from '$lib/payment/serialize';
import { inArray } from 'drizzle-orm';
import z from 'zod';

/**
 * WHAT A SELECTION OF PAYMENTS IS ASKED
 *
 * the procedures a reader's selection of a ledger calls: what deleting it would do, deleting it,
 * and putting a deleted selection back. Composed into the payment's router at its root, where
 * every path is the one it had when the whole router was one file.
 */

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
 * trusting what the reader was shown. A contract terminated between the two is one case this list
 * meets; the other, since the ledger offers a selection's delete on a terminated contract for its
 * refunds (effort 854, requirement 25), is a selection there that holds payments received, which
 * the plan turns away for the contract's state.
 *
 * **Refunds stay within what was received** (effort 854, requirement 26). A payment received on a
 * live contract goes only while what the contract keeps still covers its refunds, weighed over
 * the whole selection rather than one row at a time: every refund the selection takes comes off
 * first, since removing one only frees what was received, and then each payment received goes in
 * the reader's order while the rest still covers what stays returned. Only the ones that would
 * break it are refused, so a selection is turned away no further than the rule needs.
 *
 * One read per table for the whole selection, never one per record, and one more for the rows
 * the selected payments' contracts hold, which is what that rule is weighed against.
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

	const held = contractIds.length
		? await db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];
	// what each contract would keep, narrowed as the walk below lets a payment go.
	const keptByContractId = groupPaymentsByContractId(held);
	const selected = new Set(named);

	for (const [contractId, kept] of keptByContractId) {
		keptByContractId.set(
			contractId,
			kept.filter((payment) => payment.direction !== 'refund' || !selected.has(payment.id))
		);
	}

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

		const reason = whatRefusesPaymentDeletion(contract.status, payment.direction);

		if (reason) {
			refused.push({ id, amount: payment.amount, reason });

			continue;
		}

		if (payment.direction !== 'refund') {
			const kept = keptByContractId.get(contract.id) ?? [];
			const without = kept.filter((row) => row.id !== payment.id);

			if (!areRefundsCovered(without)) {
				refused.push({ id, amount: payment.amount, reason: 'refunds-exceed-received' });

				continue;
			}

			keptByContractId.set(contract.id, without);
		}

		eligible.push(payment);
	}

	return { eligible, refused };
}

export default router({
	/**
	 * What deleting the payments named would do, before any of it is done.
	 *
	 * A ledger row carries everything the reader sees and still cannot answer this: what locks a
	 * payment is its contract's status, which the row does not hold. It is asked the same way
	 * every other list asks, which is the point of asking at all.
	 *
	 * A query rather than a mutation: it reads and writes nothing.
	 */
	planMany: procedure
		.permitted('viewPayment')
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
	deleteMany: procedure
		.permitted('deletePayment')
		.use(autosync())
		.input(z.object({ ids: z.array(PaymentSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planPaymentSelection(ctx.db, input.ids);
			const deletableIds = plan.eligible.map((payment) => payment.id);

			if (deletableIds.length) {
				await ctx.db.delete(s.payment).where(inArray(s.payment.id, deletableIds));
				await reconcileTouched(ctx, now, {
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
	 *
	 * **Those gates are the payments received's** (effort 854, requirement 25). A refund the set puts
	 * back goes onto a terminated contract as well, and since putting a deleted set back is an
	 * undo, which takes a change back to the state before it (ticket 40, the human's ruling of
	 * 2026-10-07), it is weighed only that the contract's refunds, the set's together with what it
	 * holds, stay within what it received, the payments received the set puts back beside them
	 * included. That is how `create` weighs one refund an undo puts back, so undoing one deletion
	 * and undoing many agree. Both are the payment's one rule, `ensurePaymentWritable`, asked once
	 * per contract as a replay: nothing but an undo calls this.
	 */
	createMany: procedure
		.permitted('createPayment')
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
				throw refuse('payment.repeatedInSet', { value: repeated });
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
				throw refuse('contract.missing');
			}

			const registered = await ctx.db
				.select()
				.from(s.payment)
				.where(inArray(s.payment.contractId, contractIds));
			const registeredByContractId = groupPaymentsByContractId(registered);

			const namedByContractId = groupPaymentsByContractId(named);

			for (const contract of contracts) {
				ensurePaymentWritable(contract, registeredByContractId.get(contract.id) ?? [], {
					act: 'create',
					payments: namedByContractId.get(contract.id) ?? [],
					replay: true
				});
			}

			for (const payment of named) {
				ensureValidPaymentAmount(payment.amount);
				ensurePaymentIsNotInTheFuture(payment.date, now);
			}

			const [first, ...rest] = named.map((payment) =>
				ctx.db
					.insert(s.payment)
					.values({
						...payment,
						date: new Date(payment.date),
						reference: toStoredText(payment.reference),
						note: toStoredText(payment.note)
					})
					.returning()
			);
			const created = await ctx.db.batch([first, ...rest]);

			await reconcileTouched(ctx, now, { contractIds });

			return created.map(([payment]) => serializePayment(payment));
		})
});
