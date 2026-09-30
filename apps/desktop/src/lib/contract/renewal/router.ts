import { ensureIdFree } from '$lib/api/refusal';
import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	deriveContractStatus,
	ensureGovIdAvailable,
	ensureValidContractInput,
	getContractPaymentSummary
} from '$lib/contract/contract';
import { ensureUnitsAssignable } from '$lib/contract/assignment/assignment';
import { reconcileTouched } from '$lib/contract/reconcile';
import { selectAssignmentsForUnits, selectContract } from '$lib/contract/row';
import { serializeContract } from '$lib/contract/serialize';
import { eq } from 'drizzle-orm';
import z from 'zod';
import { ensureRenewalFollowsPredecessor } from './renewal';

/**
 * RENEWING A CONTRACT
 *
 * `contract.renew`, composed into the contract's router at its root.
 */

// what a renewal is asked for: the contract being renewed, and the successor's term. Nothing
// else is offered, because everything else the successor carries is the predecessor's — a
// renewal that could restate the cost would be an edit wearing another name. The reference is
// the successor's own, since a government id is unique to one contract.
// The optional id is the same one `create` takes, and for the same reason (ADR 0026): redoing a
// renewal that was undone puts the successor back with the identity it had.
const ContractRenewSchema = ContractSchema.pick({ govId: true, start: true, end: true }).extend({
	contractId: z.string(),
	id: z.string().optional()
});

export default router({
	/**
	 * Renew a contract: create the successor its term continues, holding the same units.
	 *
	 * The successor carries the predecessor's tenant, units, interval and cost, and only its term
	 * comes from the caller. The predecessor is read and never written — renewal continues a term
	 * rather than widening one, because a contract's expected amount and its whole derived status
	 * model are computed from its period ($lib/contract/renewal/renewal).
	 *
	 * The successor is an ordinary contract and goes down through the ordinary rules: the same
	 * period, cost and reference checks creation asserts, plus the assignment rule that refuses a
	 * unit already held over the new term. A refusal creates nothing, including the assignments —
	 * the contract and every assignment row are one batch, and the boundary runs a batch inside a
	 * transaction (ADR 0027).
	 */
	renew: procedure
		.permitted('editContract')
		.use(autosync())
		.input(ContractRenewSchema)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const { contractId, ...term } = input;
			const predecessor = await selectContract(ctx.db, contractId);

			const successor = {
				...term,
				tenantId: predecessor.tenantId,
				interval: predecessor.interval,
				cost: predecessor.cost
			};

			ensureValidContractInput(successor);
			ensureRenewalFollowsPredecessor(predecessor.end, successor.start);
			ensureIdFree(
				successor.id === undefined
					? undefined
					: await ctx.db.select().from(s.contract).where(eq(s.contract.id, successor.id)).get()
			);

			const normalizedGovId = successor.govId?.trim() || null;

			ensureGovIdAvailable(
				normalizedGovId
					? await ctx.db
							.select()
							.from(s.contract)
							.where(eq(s.contract.govId, normalizedGovId))
							.get()
					: undefined
			);

			const held = await ctx.db
				.select({ unitId: s.contractUnit.unitId })
				.from(s.contractUnit)
				.where(eq(s.contractUnit.contractId, contractId));
			const unitIds = [...new Set(held.map((assignment) => assignment.unitId))];

			// the successor does not exist yet, so no assignment is its own to be exempt from the
			// check — including the predecessor's, which is checked like any other contract's and
			// clears because the rule above already put the new term after the old one.
			ensureUnitsAssignable(await selectAssignmentsForUnits(ctx.db, unitIds), successor, '');

			const contractShape = {
				status: 'active' as const,
				start: new Date(successor.start),
				end: new Date(successor.end),
				interval: successor.interval,
				cost: successor.cost
			};
			const initialStatus = deriveContractStatus(contractShape, [], now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(contractShape, []);
			const successorId = successor.id ?? newId();
			// typed as the row being written rather than left to inference: a derived status read
			// out of a variable widens to `string` in a standalone object, where the same value
			// passed straight to `values()` keeps the union the column is declared with.
			const values: typeof s.contract.$inferInsert = {
				...successor,
				id: successorId,
				govId: normalizedGovId,
				status: initialStatus,
				paidAmount,
				expectedAmount,
				start: new Date(successor.start),
				end: new Date(successor.end)
			};

			if (unitIds.length === 0) {
				const created = await ctx.db.insert(s.contract).values(values).returning().get();

				await reconcileTouched(ctx, now, { contractIds: [created.id] });

				return serializeContract(created);
			}

			// the assignment rows name the successor by an identity the caller already holds: it is
			// minted above rather than by the engine, so the batch states it in both places.
			// Nothing has to be read back to learn it, which is what this used to do.
			const [[created]] = await ctx.db.batch([
				ctx.db.insert(s.contract).values(values).returning(),
				...unitIds.map((unitId) =>
					ctx.db.insert(s.contractUnit).values({ contractId: successorId, unitId }).returning()
				)
			]);

			await reconcileTouched(ctx, now, { contractIds: [created.id], unitIds });

			return serializeContract(created);
		})
});
