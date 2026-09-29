import { ensureIdFree, newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	deriveContractStatus,
	ensureContractDeletable,
	ensureContractIsNotTerminated,
	ensureContractTerminable,
	ensureContractUnterminable,
	ensureGovIdAvailable,
	ensureValidContractInput,
	getContractPaymentSummary
} from '$lib/contract/contract';
import {
	ensurePeriodDoesNotOverlapAssignments,
	ensureUnitsAssignable,
	hasSameUtcDateRange
} from '$lib/contract/assignment/assignment';
import { reconcile, reconcileTouched } from '$lib/contract/reconcile';
import { selectAssignmentsForUnits, selectPaymentsForContract } from '$lib/contract/row';
import { serializeContract, withRank } from '$lib/contract/serialize';
import { eq, inArray, sql } from 'drizzle-orm';
import z from 'zod';
import assignment from './assignment/router';
import directory from './directory/router';
import renewal from './renewal/router';
import schedule from './schedule/router';
import selection from './selection/router';

// status and the payment aggregates are derived columns: reconcile owns them, so no
// caller may supply them.
// an optional id, so undoing a deletion can put the row back with the identity it had — a page
// still open on that record is holding a reference to it (ADR 0026). Absent otherwise, and the
// engine assigns one.
const ContractFieldsSchema = ContractSchema.omit({
	status: true,
	paidAmount: true,
	expectedAmount: true
}).partial({ id: true });
// a new contract with the units it is created holding, which the form chooses alongside the
// tenant (effort 832, requirement 20). Empty by default: a contract may start holding none and
// take its units on the tab later.
const ContractCreateSchema = ContractFieldsSchema.extend({
	unitIds: z.array(z.string()).default([])
});
const ContractUpdateSchema = ContractSchema.omit({
	status: true,
	paidAmount: true,
	expectedAmount: true
});

/**
 * THE CONTRACT'S PROCEDURES
 *
 * one router, `contract`, whose procedures each concern of the contract states beside its own
 * rules: renewal, the directory, the schedule and the reminder, and what a selection is asked, at
 * the root of this router beside the single-record writes below; the units a contract holds
 * under `units`. Every path is the one it had when the whole router was this file.
 */
export default router({
	/**
	 * Create a contract, holding the units it was created with.
	 *
	 * The units are checked against the proposed term exactly as a renewal's are, and a unit
	 * another contract holds over it refuses the whole call under the units the reader chose. The
	 * contract and its assignment rows are one batch, and the boundary runs a batch inside a
	 * transaction (ADR 0027), so a refusal creates neither.
	 */
	create: procedure
		.permitted('createContract')
		.use(autosync())
		.input(ContractCreateSchema)
		.mutation(async ({ input: { unitIds: chosenUnitIds, ...input }, ctx }) => {
			const now = ctx.clock.now();

			ensureValidContractInput(input);
			ensureIdFree(
				input.id === undefined
					? undefined
					: await ctx.db.select().from(s.contract).where(eq(s.contract.id, input.id)).get()
			);

			const tenant = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.id, input.tenantId))
				.get();

			if (!tenant) {
				throw refuse('contract.tenantMissing');
			}

			const normalizedGovId = input.govId?.trim() || null;

			ensureGovIdAvailable(
				normalizedGovId
					? await ctx.db
							.select()
							.from(s.contract)
							.where(eq(s.contract.govId, normalizedGovId))
							.get()
					: undefined
			);

			const unitIds = [...new Set(chosenUnitIds)];

			if (unitIds.length) {
				const units = await ctx.db
					.select({ id: s.unit.id })
					.from(s.unit)
					.where(inArray(s.unit.id, unitIds));

				if (units.length !== unitIds.length) {
					throw refuse('contract.unitsMissing');
				}

				// the contract does not exist yet, so no assignment is its own to be exempt from.
				ensureUnitsAssignable(
					await selectAssignmentsForUnits(ctx.db, unitIds),
					input,
					'',
					'contract.unitsTaken'
				);
			}

			const contractShape = {
				status: 'active' as const,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			};
			const initialStatus = deriveContractStatus(contractShape, [], now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(contractShape, []);
			const contractId = input.id ?? newId();
			// typed as the row being written, for the reason `renew` gives (`renewal/router.ts`).
			const values: typeof s.contract.$inferInsert = {
				...input,
				id: contractId,
				govId: normalizedGovId,
				status: initialStatus,
				paidAmount,
				expectedAmount,
				start: new Date(input.start),
				end: new Date(input.end)
			};

			if (unitIds.length === 0) {
				const created = await ctx.db.insert(s.contract).values(values).returning().get();

				await reconcileTouched(ctx, now, { contractIds: [created.id] });

				return serializeContract(created);
			}

			// the identity is minted above, so the assignment rows name the contract in the same
			// batch that creates it, as a renewal's do.
			const [[created]] = await ctx.db.batch([
				ctx.db.insert(s.contract).values(values).returning(),
				...unitIds.map((unitId) =>
					ctx.db.insert(s.contractUnit).values({ contractId, unitId }).returning()
				)
			]);

			await reconcileTouched(ctx, now, { contractIds: [created.id], unitIds });

			return serializeContract(created);
		}),

	...renewal._def.record,

	update: procedure
		.permitted('editContract')
		.use(autosync())
		.input(ContractUpdateSchema)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			ensureValidContractInput(input);

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw refuse('contract.missing');
			}

			ensureContractIsNotTerminated(existingContract.status);

			const tenant = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.id, input.tenantId))
				.get();

			if (!tenant) {
				throw refuse('contract.tenantMissing');
			}

			const normalizedGovId = input.govId?.trim() || null;

			ensureGovIdAvailable(
				normalizedGovId
					? await ctx.db
							.select()
							.from(s.contract)
							.where(
								sql`${s.contract.govId} = ${normalizedGovId} AND ${s.contract.id} != ${input.id}`
							)
							.get()
					: undefined
			);

			const hasDateRangeChanged = !hasSameUtcDateRange(
				existingContract.start,
				existingContract.end,
				input.start,
				input.end
			);

			if (hasDateRangeChanged) {
				const assignedUnits = await ctx.db
					.select({ unitId: s.contractUnit.unitId })
					.from(s.contractUnit)
					.where(eq(s.contractUnit.contractId, input.id));
				const assignments = await selectAssignmentsForUnits(ctx.db, [
					...new Set(assignedUnits.map((assignment) => assignment.unitId))
				]);

				ensurePeriodDoesNotOverlapAssignments(
					assignments,
					{ start: input.start, end: input.end },
					input.id
				);
			}

			const existingPayments = await selectPaymentsForContract(ctx.db, input.id);
			const contractShape = {
				status: existingContract.status,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			};
			const nextStatus = deriveContractStatus(contractShape, existingPayments, now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(
				contractShape,
				existingPayments
			);

			const updated = await ctx.db
				.update(s.contract)
				.set({
					govId: normalizedGovId,
					status: nextStatus,
					paidAmount,
					expectedAmount,
					start: new Date(input.start),
					end: new Date(input.end),
					interval: input.interval,
					cost: input.cost,
					tenantId: input.tenantId
				})
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [input.id] });

			return serializeContract(updated);
		}),

	terminate: procedure
		.permitted('editContract')
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw refuse('contract.missing');
			}

			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractTerminable(deriveContractStatus(existingContract, payments, now));

			const terminated = await ctx.db
				.update(s.contract)
				.set({ status: 'terminated' })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [input.id] });

			return serializeContract(terminated);
		}),

	...selection._def.record,

	unterminate: procedure
		.permitted('editContract')
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw refuse('contract.missing');
			}

			ensureContractUnterminable(existingContract.status);

			const payments = await selectPaymentsForContract(ctx.db, input.id);
			const restoredStatus = deriveContractStatus(
				{ ...existingContract, status: 'active' },
				payments,
				now
			);

			const restored = await ctx.db
				.update(s.contract)
				.set({ status: restoredStatus })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx, now, { contractIds: [input.id] });

			return serializeContract(restored);
		}),

	delete: procedure
		.permitted('deleteContract')
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				return undefined;
			}

			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractDeletable(payments);

			const units = await ctx.db
				.select({ unitId: s.contractUnit.unitId })
				.from(s.contractUnit)
				.where(eq(s.contractUnit.contractId, input.id));
			const unitIds = units.map((unit) => unit.unitId);

			// the units it held go with it, in one batch with the contract (ADR 0027): a contract
			// gone and its assignment rows left behind would hold units for nobody.
			const [, [deleted]] = await ctx.db.batch([
				ctx.db.delete(s.contractUnit).where(eq(s.contractUnit.contractId, input.id)),
				ctx.db.delete(s.contract).where(eq(s.contract.id, input.id)).returning()
			]);

			// the contract is gone, so what is left to reconcile is the units it released.
			await reconcileTouched(ctx, ctx.clock.now(), { contractIds: [], unitIds });

			// the units it held come back with the row, because undoing the deletion restores the
			// contract holding them.
			return deleted ? { ...serializeContract(deleted), unitIds } : deleted;
		}),

	...directory._def.record,

	// one contract, with the rank it is filed under today, so the record page's acts gate on it
	// as a card's do.
	get: procedure
		.permitted('viewContract')
		.input(ContractSchema.pick({ id: true, govId: true }).partial())
		.query(async ({ input, ctx }) => {
			const matching = input.id
				? eq(s.contract.id, input.id)
				: input.govId
					? eq(s.contract.govId, input.govId)
					: undefined;

			if (!matching) {
				return undefined;
			}

			const contract = await ctx.db.select().from(s.contract).where(matching).get();

			if (!contract) {
				return undefined;
			}

			const { endingSoonNoticeDays } = await ctx.host.settings.get();

			return withRank(serializeContract(contract), ctx.clock.now(), endingSoonNoticeDays);
		}),

	...schedule._def.record,

	units: assignment,

	/**
	 * Recompute every contract's and unit's status and the payment aggregates, for the triggers
	 * that have no touch-set: startup, a UTC-day crossing while the app runs, and a remote-sync
	 * pull. *It was `app.state.reconcile` until effort 840 flattened the router tree.*
	 */
	reconcile: procedure.member.mutation(async ({ ctx }) => {
		const reconciledAt = ctx.clock.now();
		await reconcile(ctx, reconciledAt);

		return { reconciledAt };
	})
});
