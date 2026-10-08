import { ensureIdFree } from '$lib/api/refusal';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	CONTRACT_SELECTION_ACTIONS,
	deriveContractStatus,
	ensureGovIdAvailable,
	whatRefusesContractAction,
	type ContractRefusalReason,
	type ContractSelectionAction
} from '$lib/contract/contract';
import {
	unitsTakenFromRestore,
	type ContractAssignment
} from '$lib/contract/assignment/assignment';
import { reconcileTouched, type Settling } from '$lib/contract/reconcile';
import { contractsHoldingGovId, selectAssignmentsForUnits } from '$lib/contract/row';
import { serializeContract } from '$lib/contract/serialize';
import { eq, inArray } from 'drizzle-orm';
import z from 'zod';

/**
 * WHAT A SELECTION OF CONTRACTS IS ASKED
 *
 * the procedures a reader's selection calls: what one of the three actions would do to it, each of
 * the three done to the whole of it at once, and putting a deleted selection back. Composed into
 * the contract's router at its root.
 */

// a deleted contract as its deletion answered with it: the row whole, status and aggregates
// included, with the units it held. What undoing a deletion puts back, and only that
// ([[rules/data]], under *Undo*).
const ContractRestoreSchema = ContractSchema.extend({
	unitIds: z.array(z.string()).default([])
});

// the vocabulary is the concept's, so the input can only name an action the domain answers for.
const ContractSelectionActionSchema = z.enum(CONTRACT_SELECTION_ACTIONS);

type DbContract = typeof s.contract.$inferSelect;
type DbContractUnit = typeof s.contractUnit.$inferSelect;

/** A contract that would be turned away, named the way a reader knows one. */
type ContractRefusal = { id: string; govId: string; reason: ContractRefusalReason };

/**
 * What one action would do to a whole selection, from one read of the workspace.
 *
 * **The plan and the mutation are the same call.** `contract.planMany` and each of the three
 * mutations it precedes go through this, so the confirmation shows what the mutation is about to
 * decide rather than a second opinion about it. They can still disagree about the *workspace*,
 * because another device may write between the two, and that is why the mutation runs this again
 * instead of trusting what the reader was shown.
 *
 * One read per table for the whole selection, never one per record.
 */
async function planContractSelection(
	ctx: Settling,
	now: number,
	ids: readonly string[],
	action: ContractSelectionAction
) {
	const { db } = ctx;
	const named = [...new Set(ids)];

	const existing = await db.select().from(s.contract).where(inArray(s.contract.id, named));
	const contractsById = new Map(existing.map((contract) => [contract.id, contract]));

	const paymentsByContractId = await ctx.contributions.contract.paymentsOf(db, named);

	// a deletion and a restore read assignments. The units a deleted contract held go with it, and
	// are what putting it back has to restore; a restored contract is live again, so every other
	// holder of its units is read too, to refuse it a unit another contract took since.
	const assignments =
		action === 'delete' || action === 'restore'
			? await db.select().from(s.contractUnit).where(inArray(s.contractUnit.contractId, named))
			: [];
	const holders =
		action === 'restore'
			? await selectAssignmentsForUnits(db, [
					...new Set(assignments.map((assignment) => assignment.unitId))
				])
			: [];
	// the holds of the contracts restored earlier in this walk, live as they will be once it is
	// done, so two terminated contracts on one unit over intersecting terms are not both restored.
	const claimed: ContractAssignment[] = [];
	const assignmentsByContractId = new Map<string, DbContractUnit[]>();

	for (const assignment of assignments) {
		const held = assignmentsByContractId.get(assignment.contractId) ?? [];

		held.push(assignment);
		assignmentsByContractId.set(assignment.contractId, held);
	}

	const eligible: DbContract[] = [];
	const refused: ContractRefusal[] = [];

	// walked in the order the reader named them, so what the confirmation lists reads the way the
	// selection does rather than the way the engine happened to answer.
	for (const id of named) {
		const contract = contractsById.get(id);

		if (!contract) {
			refused.push({ id, govId: '', reason: 'missing' });

			continue;
		}

		const unitsTaken =
			action === 'restore' &&
			unitsTakenFromRestore([...holders, ...claimed], contract, id).length > 0;
		const reason = whatRefusesContractAction(
			action,
			contract,
			paymentsByContractId.get(id) ?? [],
			now,
			{ unitsTaken }
		);

		if (reason) {
			refused.push({ id, govId: contract.govId ?? '', reason });

			continue;
		}

		eligible.push(contract);

		if (action === 'restore') {
			for (const held of assignmentsByContractId.get(id) ?? []) {
				claimed.push({
					unitId: held.unitId,
					contractId: id,
					status: 'active',
					start: contract.start,
					end: contract.end,
					interval: contract.interval,
					cost: contract.cost
				});
			}
		}
	}

	return { eligible, refused, paymentsByContractId, assignmentsByContractId };
}

/** A contract a multi-record action changed, named the way its own history names it. */
const toChangedContract = (contract: DbContract) => ({
	id: contract.id,
	govId: contract.govId ?? ''
});

export default router({
	/**
	 * What one of the three selection actions would do, before any of it is done.
	 *
	 * **Asked rather than inferred from the rows on screen.** A contract row carries its status
	 * and a payment count, and neither answers what a deletion is refused for: a contract is
	 * refused for holding units, which no row knows. Terminating and restoring turn on a status
	 * the row does hold, and they are asked through here anyway — a status is derived from what
	 * the contract owes today, so a row loaded before a UTC day crossing is stale against the rule
	 * the mutation is about to apply, and an application that plans two of its actions from the
	 * row and the third from a query has two answers to one question.
	 *
	 * A query rather than a mutation: it reads and writes nothing.
	 */
	planMany: procedure
		.permitted('viewContract')
		.input(
			z.object({
				ids: z.array(ContractSchema.shape.id).min(1),
				action: ContractSelectionActionSchema
			})
		)
		.query(async ({ input, ctx }) => {
			const plan = await planContractSelection(ctx, ctx.clock.now(), input.ids, input.action);

			return { eligible: plan.eligible.map((contract) => contract.id), refused: plan.refused };
		}),

	/**
	 * Terminate every contract named, and say which of them could not be.
	 *
	 * **One mutation over a union touch-set, not one per record.** `reconcileTouched` already
	 * takes a set, and both reconcile paths write one `UPDATE` per changed row, sequentially
	 * awaited — in process that is sub-millisecond, and over a wire it is a round trip each. So
	 * calling the single-record procedure N times would cost N reconcile passes for work one pass
	 * does, and the platform effort prices exactly that.
	 *
	 * **A refusal is reported, not thrown.** A selection is a set the reader assembled by eye,
	 * and some of it being ineligible is ordinary rather than exceptional — a status that cannot
	 * be terminated by hand is a fact about that contract, not a failure of the request. Throwing
	 * would undo the ones that were fine and tell the reader nothing about which.
	 */
	terminateMany: procedure
		.permitted('editContract')
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planContractSelection(ctx, now, input.ids, 'terminate');
			const terminableIds = plan.eligible.map((contract) => contract.id);

			if (terminableIds.length) {
				await ctx.db
					.update(s.contract)
					.set({ status: 'terminated' })
					.where(inArray(s.contract.id, terminableIds));
			}

			// the one pass, over every contract that changed. This is the line the ticket's
			// assertion is about, and the reason the plan above collects rather than acting.
			await reconcileTouched(ctx, now, { contractIds: terminableIds });

			return {
				terminated: plan.eligible.map(toChangedContract),
				// named rather than counted: a reader who selected twelve and changed nine needs to
				// know which three, and the reference they know a contract by is its government id.
				refused: plan.refused
			};
		}),

	/**
	 * Put every terminated contract in the selection back, and say which of them could not be.
	 *
	 * Both the restore a reader asks for on a selection and the reverse of {@link terminateMany},
	 * because they are the same act. Undoing a termination passes exactly what that call reported
	 * it changed, so nothing it refused is put back on the way.
	 */
	unterminateMany: procedure
		.permitted('editContract')
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planContractSelection(ctx, now, input.ids, 'restore');

			// each one goes back to the status its own payments and period imply, exactly as the
			// single-record procedure does — never to whatever it happened to hold before.
			for (const contract of plan.eligible) {
				const restoredStatus = deriveContractStatus(
					{ ...contract, status: 'active' },
					plan.paymentsByContractId.get(contract.id) ?? [],
					now
				);

				await ctx.db
					.update(s.contract)
					.set({ status: restoredStatus })
					.where(eq(s.contract.id, contract.id));
			}

			await reconcileTouched(ctx, now, {
				contractIds: plan.eligible.map((contract) => contract.id)
			});

			return { unterminated: plan.eligible.map(toChangedContract), refused: plan.refused };
		}),

	/**
	 * Delete every contract in the selection that nothing depends on, and name the rest.
	 *
	 * The deleted rows come back whole rather than as ids, each with the units it held, because
	 * that is what putting them back needs: an undo restores each record as itself, by its own
	 * identity (ADR 0026), and once the rows are gone there is nothing left to read them from.
	 *
	 * The contracts and their assignment rows go in one batch (ADR 0027), and the units they
	 * released are reconciled, since those units' occupancy rested on the contracts now gone.
	 */
	deleteMany: procedure
		.permitted('deleteContract')
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const plan = await planContractSelection(ctx, ctx.clock.now(), input.ids, 'delete');
			const deletableIds = plan.eligible.map((contract) => contract.id);
			const unitIdsOf = (contractId: string) =>
				(plan.assignmentsByContractId.get(contractId) ?? []).map((held) => held.unitId);
			const released = [...new Set(deletableIds.flatMap(unitIdsOf))];

			if (deletableIds.length) {
				await ctx.db.batch([
					ctx.db.delete(s.contractUnit).where(inArray(s.contractUnit.contractId, deletableIds)),
					ctx.db.delete(s.contract).where(inArray(s.contract.id, deletableIds))
				]);
			}

			if (released.length) {
				await reconcileTouched(ctx, ctx.clock.now(), { contractIds: [], unitIds: released });
			}

			return {
				deleted: plan.eligible.map((contract) => ({
					...serializeContract(contract),
					unitIds: unitIdsOf(contract.id)
				})),
				refused: plan.refused
			};
		}),

	/**
	 * Put a set of deleted contracts back, all of them or none, as they were.
	 *
	 * What undoing `contract.delete` and {@link deleteMany} calls. **It restores rows rather than
	 * creating contracts** ([[rules/data]], under *Undo*): each contract goes back with the status it
	 * held and the units it held, and neither is asked of the workspace again. A create would derive
	 * the status afresh, bringing a terminated contract back active, and would ask whether its units
	 * are free today, refusing one another contract took after the deletion. Neither is what taking a
	 * deletion back means. Reconcile runs afterwards over what was restored, as for any other write.
	 *
	 * All or nothing, because a set half restored leaves the workspace in a shape neither the
	 * deletion nor the undo describes. One batch, and the boundary runs a batch inside one
	 * transaction (ADR 0027), so a refusal anywhere in the set restores nothing.
	 *
	 * **It throws rather than reporting**, which is what leaves the entry on the undo stack: an
	 * inverse that threw did not move the workspace, so the reader can deal with whatever refused
	 * it and press undo again. What it still refuses is what the schema could not hold: an identity
	 * or a government id taken since, a tenant or a unit gone since. Every refusal names the
	 * contract it is about where there is one to name.
	 */
	restoreMany: procedure
		.permitted('editContract')
		.use(autosync())
		.input(z.object({ contracts: z.array(ContractRestoreSchema).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			// what each is put back holding, by the identity it had.
			const heldBy = new Map<string, string[]>();
			const named = input.contracts.map(({ unitIds, ...contract }) => {
				heldBy.set(contract.id, [...new Set(unitIds)]);

				return { ...contract, govId: contract.govId?.trim() || null };
			});
			const ids = named.map((contract) => contract.id);
			const govIds = named.map((contract) => contract.govId).filter((govId) => govId !== null);

			// the set against itself, on both of the things a contract is unique by, before it is
			// weighed against the workspace at all. A set that contradicts itself is a contradiction
			// the engine would only report part-way through, and this write is meant to land whole
			// or not at all.
			const repeated =
				ids.find((id, index) => ids.indexOf(id) !== index) ??
				govIds.find((govId, index) => govIds.indexOf(govId) !== index);

			if (repeated) {
				throw refuse('contract.repeatedInSet', { value: repeated });
			}

			const held = await ctx.db.select().from(s.contract).where(inArray(s.contract.id, ids));

			ensureIdFree(held[0], held[0]?.id);

			const tenantIds = [...new Set(named.map((contract) => contract.tenantId))];
			const tenants = await ctx.db
				.select({ id: s.tenant.id })
				.from(s.tenant)
				.where(inArray(s.tenant.id, tenantIds));
			const heldTenantIds = new Set(tenants.map((tenant) => tenant.id));
			const missingTenant = tenantIds.find((tenantId) => !heldTenantIds.has(tenantId));

			if (missingTenant) {
				throw refuse('contract.tenantMissingNamed', { named: missingTenant });
			}

			const taken = await contractsHoldingGovId(ctx.db, govIds);

			ensureGovIdAvailable(taken[0], taken[0]?.govId ?? undefined);

			const unitIds = [...new Set([...heldBy.values()].flat())];

			if (unitIds.length) {
				const units = await ctx.db
					.select({ id: s.unit.id })
					.from(s.unit)
					.where(inArray(s.unit.id, unitIds));

				if (units.length !== unitIds.length) {
					throw refuse('contract.unitsMissing');
				}
			}

			// the row as it was, status and aggregates included: reconcile below is what brings any
			// derived column forward to today, exactly as it would for a row that never left.
			const values: (typeof s.contract.$inferInsert)[] = named.map((contract) => ({
				...contract,
				start: new Date(contract.start),
				end: new Date(contract.end)
			}));

			const [first, ...rest] = values.map((value) =>
				ctx.db.insert(s.contract).values(value).returning()
			);
			// the assignment rows go down in the same batch as the contracts they name.
			const assignments = [...heldBy].flatMap(([contractId, held]) =>
				held.map((unitId) =>
					ctx.db.insert(s.contractUnit).values({ contractId, unitId }).returning()
				)
			);
			const restored = await ctx.db.batch([first, ...rest, ...assignments]);

			await reconcileTouched(ctx, now, { contractIds: ids, unitIds });

			return (restored.slice(0, values.length) as DbContract[][]).map(([contract]) =>
				serializeContract(contract)
			);
		})
});
