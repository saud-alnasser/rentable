import type { Database } from '$lib/api/context';
import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { matchesAnySearch } from '$lib/platform/database/search';
import { ensureIdFree, newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	CONTRACT_ATTENTION_ORDER,
	CONTRACT_SELECTION_ACTIONS,
	CONTRACT_SORT_COLUMN_IDS,
	type ContractSortColumnId,
	deriveContractStatus,
	deriveUnitStatuses,
	ensureContractDeletable,
	ensureContractIsNotTerminated,
	ensureContractTerminable,
	ensureContractUnterminable,
	ensureContractUnitsAreMutable,
	ensureGovIdAvailable,
	ensurePeriodDoesNotOverlapAssignments,
	ensureUnitsAssignable,
	ensureValidContractInput,
	getConflictingAssignedUnitIds,
	getContractPaymentSummary,
	getExpectedAmountBy,
	hasSameUtcDateRange,
	whatRefusesContractAction,
	type ContractRefusalReason,
	type ContractSelectionAction
} from '$lib/contract/contract';
import {
	CONTRACT_RANKS,
	compareContractsByRank,
	getContractRank,
	getContractRankBounds,
	type ContractRankBounds,
	type ContractRankOrder
} from '$lib/contract/rank';
import { ensureRenewalFollowsPredecessor } from '$lib/contract/renewal';
import { reconcileTouched } from '$lib/contract/reconcile';
import { serializeContract } from '$lib/contract/serialize';
import dashboard from '$lib/dashboard/router';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import payment from '$lib/payment/router';
import { TRPCError } from '@trpc/server';
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	lt,
	notInArray,
	sql,
	type AnyColumn,
	type SQL
} from 'drizzle-orm';
import z from 'zod';

// status and the payment aggregates are derived columns: reconcile owns them, so no
// caller may supply them.
// an optional id, so undoing a deletion can put the row back with the identity it had — a page
// still open on that record is holding a reference to it (ADR 0026). Absent otherwise, and the
// engine assigns one.
const ContractCreateSchema = ContractSchema.omit({
	status: true,
	paidAmount: true,
	expectedAmount: true
}).partial({ id: true });
const ContractUpdateSchema = ContractSchema.omit({
	status: true,
	paidAmount: true,
	expectedAmount: true
});

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

const ContractUnitsGetManySchema = z.object({ contractId: z.string() });
const ContractAssignableUnitsSchema = z.object({
	contractId: z.string(),
	search: z.string().optional()
});
// the whole set, not an addition to it: an empty array is the contract holding no units, which
// is what removing the last one means.
const ContractUnitsSetSchema = z.object({
	contractId: z.string(),
	unitIds: z.array(z.string())
});

// fetches the assignment rows (joined with their contracts) for the given units — the
// shape every derivation and overlap rule takes.
async function selectAssignmentsForUnits(db: Database, unitIds: string[]) {
	if (unitIds.length === 0) {
		return [];
	}

	return await db
		.select({
			unitId: s.contractUnit.unitId,
			contractId: s.contract.id,
			status: s.contract.status,
			start: s.contract.start,
			end: s.contract.end,
			interval: s.contract.interval,
			cost: s.contract.cost
		})
		.from(s.contractUnit)
		.innerJoin(s.contract, eq(s.contractUnit.contractId, s.contract.id))
		.where(inArray(s.contractUnit.unitId, unitIds));
}

// fetches the payment rows registered against a contract, for rules that lock on them.
async function selectPaymentsForContract(db: Database, contractId: string) {
	return await db.select().from(s.payment).where(eq(s.payment.contractId, contractId));
}

// the contract a unit procedure is about, refused rather than returned absent: every one of
// them reads a rule off it, and there is no answer to give for a contract that is not there.
async function selectContract(db: Database, contractId: string) {
	const contract = await db.select().from(s.contract).where(eq(s.contract.id, contractId)).get();

	if (!contract) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'contract does not exist' });
	}

	return contract;
}

// the units a contract holds, each carrying the complex holding it and its derived status —
// the shape both the directory that reads them and the surface that writes them answer with.
async function selectContractUnits(db: Database, contractId: string, now: number) {
	const units = await db
		.select({
			id: s.unit.id,
			name: s.unit.name,
			complexId: s.unit.complexId,
			complexName: s.complex.name,
			contractId: s.contractUnit.contractId
		})
		.from(s.contractUnit)
		.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
		.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
		.where(eq(s.contractUnit.contractId, contractId));

	const unitIds = [...new Set(units.map((unit) => unit.id))];

	// the empty case returns the same shape as the full one rather than the bare rows: a
	// procedure whose result type depends on how many rows it found makes every caller handle a
	// shape it can never actually observe.
	if (unitIds.length === 0) {
		return units.map((unit) => ({ ...unit, status: 'vacant' as const }));
	}

	const assignments = await selectAssignmentsForUnits(db, unitIds);
	const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
	const payments = contractIds.length
		? await db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];
	const statusByUnitId = deriveUnitStatuses(
		unitIds,
		assignments,
		groupPaymentsByContractId(payments),
		now
	);

	return units.map((unit) => ({
		...unit,
		status: statusByUnitId.get(unit.id) ?? 'vacant'
	}));
}

// ordering by status, as one expression the database can sort on: the position a status holds
// in CONTRACT_ATTENTION_ORDER. Built from the array rather than written out, so the order is
// stated once and a status added to the enum without a position sorts last instead of silently
// landing among the ones that need attention.
//
// Not the attention *rank* of ADR 0031, which is decided from what a contract owes today and
// cannot be expressed here — this only sorts on the stored status column.
const contractStatusOrder = sql.join(
	[
		sql`case`,
		...CONTRACT_ATTENTION_ORDER.map(
			(status, rank) => sql`when ${s.contract.status} = ${status} then ${rank}`
		),
		sql`else ${CONTRACT_ATTENTION_ORDER.length} end`
	],
	sql` `
);

// How many payments have been recorded against the contract, counted on the list query itself
// rather than by a query per row — the shape the tenant and complex aggregates already take.
// A correlated subquery rather than a join, because the directory's own joins are what its
// ordering is built on and grouping them would change which rows the order sees.
//
// It is a count and never a sum: the money a contract has taken is `paid_amount`, which
// reconcile owns (ADR 0006), and a second figure derived here could disagree with it.
//
// **What makes a correlated subquery affordable is the index on `payment.contract_id`**, which
// `packages/workspace-migrations/migrations/0004_ordinary_nightshade.sql` adds and whose notes
// carry the measurement. Unindexed, this was a scan of every payment for every contract and cost
// the list sixteen times what the same query costs without it.
const contractPaymentCount = sql<number>`(
	select count(*) from ${s.payment} where ${s.payment.contractId} = ${s.contract.id}
)`;

// Whether the contract has the given unit assigned to it, as an EXISTS rather than a join:
// joining the assignment table would multiply a contract holding several units into one row
// per unit, and the list's own ordering has no way to tell those apart.
const contractHoldsUnit = (unitId: string) => sql`exists (
	select 1 from ${s.contractUnit}
	where ${s.contractUnit.contractId} = ${s.contract.id} and ${s.contractUnit.unitId} = ${unitId}
)`;

// The same question one join further out: whether the contract holds any unit in the given
// complex. An EXISTS for the same reason — a contract holding three units in the complex would
// otherwise become three rows, and the list's ordering cannot tell those apart.
const contractHoldsUnitInComplex = (complexId: string) => sql`exists (
	select 1 from ${s.contractUnit}
	inner join ${s.unit} on ${s.unit.id} = ${s.contractUnit.unitId}
	where ${s.contractUnit.contractId} = ${s.contract.id} and ${s.unit.complexId} = ${complexId}
)`;

// The bounds an attention rank puts on stored columns, as a `where` term.
//
// A rank cannot be a `where` — it is decided from what a contract owes today, which no column
// holds — but everything a rank *implies* about the stored columns can be, and rank.ts states
// exactly that as bounds. Narrowing on them turns the read from the whole table into a superset
// of the rank, small enough that deciding the rest in TypeScript costs what a rank filter should.
//
// Translation only: which bounds a rank has is the ranking's, and adding one here that rank.ts
// does not state is how a query comes to answer something the rank does not mean.
//
// It narrows on the materialized aggregates, so it depends on reconcile having written them —
// which is a stronger dependency than a read that only displays them. `expected_amount` arrived
// with a default of zero and no backfill, and a contract still carrying that zero would be
// filtered out of a money rank rather than merely shown a stale figure. `reconcile` walks the
// whole table at startup and after a remote pull, which is what closes it.
function matchesRankBounds(bounds: ContractRankBounds): SQL | undefined {
	return and(
		// copied rather than passed through: the bounds are readonly, and drizzle's own
		// signature takes a mutable array
		'holds' in bounds.status
			? inArray(s.contract.status, [...bounds.status.holds])
			: notInArray(s.contract.status, [...bounds.status.excludes]),
		// column against column, which the comparison helpers do not type, so it is written out
		bounds.requiresUnpaidBalance
			? sql`${s.contract.paidAmount} < ${s.contract.expectedAmount}`
			: undefined,
		bounds.endFrom ? gte(s.contract.end, bounds.endFrom) : undefined,
		bounds.endBefore ? lt(s.contract.end, bounds.endBefore) : undefined
	);
}

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
	db: Database,
	now: number,
	ids: readonly string[],
	action: ContractSelectionAction
) {
	const named = [...new Set(ids)];

	const existing = await db.select().from(s.contract).where(inArray(s.contract.id, named));
	const contractsById = new Map(existing.map((contract) => [contract.id, contract]));

	const payments = await db.select().from(s.payment).where(inArray(s.payment.contractId, named));
	const paymentsByContractId = groupPaymentsByContractId(payments);

	// only a deletion weighs assignments, and only a deletion pays to read them.
	const assignments =
		action === 'delete'
			? await db.select().from(s.contractUnit).where(inArray(s.contractUnit.contractId, named))
			: [];
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

		const reason = whatRefusesContractAction(
			action,
			contract,
			paymentsByContractId.get(id) ?? [],
			assignmentsByContractId.get(id) ?? [],
			now
		);

		if (reason) {
			refused.push({ id, govId: contract.govId ?? '', reason });
		} else {
			eligible.push(contract);
		}
	}

	return { eligible, refused, paymentsByContractId };
}

/** A contract a multi-record action changed, named the way its own history names it. */
const toChangedContract = (contract: DbContract) => ({
	id: contract.id,
	govId: contract.govId ?? ''
});

const CONTRACT_SORT_COLUMNS: Record<ContractSortColumnId, SQL | AnyColumn> = {
	tenantName: s.tenant.name,
	govId: s.contract.govId,
	start: s.contract.start,
	end: s.contract.end,
	cost: s.contract.cost,
	status: contractStatusOrder
};

const ContractSortSchema = z.object({
	columnId: z.enum(CONTRACT_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

// the order the directory opens in, and the order ties fall back to under any other: tenant
// name, then when the contract runs, then the id that makes the order total. Each term
// carries the sort key it answers, so the chosen key can be dropped from the fallback
// wherever it appears — a term repeated below the key it was chosen as can never break a tie
// that key did not already break.
const CONTRACT_DIRECTORY_ORDER: readonly { columnId?: ContractSortColumnId; term: SQL }[] = [
	{ columnId: 'tenantName', term: asc(s.tenant.name) },
	{ columnId: 'start', term: asc(s.contract.start) },
	{ term: asc(s.contract.id) }
];

/**
 * Ties fall back to the directory's own order — tenant name, then when the contract runs,
 * then id — less whichever of those the reader is already ordering by.
 *
 * A status or a cost is shared by whole screens of contracts, so ordering by one alone
 * leaves most of the list tied; breaking those by id would show equal values in insertion
 * order, which reads as no order at all. One tenant's contracts then read oldest first, and
 * the id is last because nothing above it is unique — without a total order two renders of
 * the same query may disagree.
 */
function contractOrderBy(sort: z.infer<typeof ContractSortSchema> | undefined): SQL[] {
	if (!sort) {
		return CONTRACT_DIRECTORY_ORDER.map(({ term }) => term);
	}

	const column = CONTRACT_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return [
		chosen,
		...CONTRACT_DIRECTORY_ORDER.filter(({ columnId }) => columnId !== sort.columnId).map(
			({ term }) => term
		)
	];
}

// every field the list can be searched by, whether or not the row shows it — a field dropped
// from a surface is never dropped from search. The comparison itself is the shared one, so a
// term folds and a column folds the same way here as everywhere else.
const CONTRACT_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [
	s.contract.govId,
	s.tenant.name,
	s.tenant.phone,
	s.contract.tenantId,
	s.contract.status,
	s.contract.interval,
	s.contract.cost
];

export default router({
	create: procedure.member
		.use(autosync())
		.input(ContractCreateSchema)
		.mutation(async ({ input, ctx }) => {
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'tenant does not exist'
				});
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

			const contractShape = {
				status: 'active' as const,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			};
			const initialStatus = deriveContractStatus(contractShape, [], now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(contractShape, []);

			const created = await ctx.db
				.insert(s.contract)
				.values({
					...input,
					id: input.id ?? newId(),
					govId: normalizedGovId,
					status: initialStatus,
					paidAmount,
					expectedAmount,
					start: new Date(input.start),
					end: new Date(input.end)
				})
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [created.id] });

			return serializeContract(created);
		}),

	/**
	 * Renew a contract: create the successor its term continues, holding the same units.
	 *
	 * The successor carries the predecessor's tenant, units, interval and cost, and only its term
	 * comes from the caller. The predecessor is read and never written — renewal continues a term
	 * rather than widening one, because a contract's expected amount and its whole derived status
	 * model are computed from its period ($lib/contract/renewal).
	 *
	 * The successor is an ordinary contract and goes down through the ordinary rules: the same
	 * period, cost and reference checks creation asserts, plus the assignment rule that refuses a
	 * unit already held over the new term. A refusal creates nothing, including the assignments —
	 * the contract and every assignment row are one batch, and the boundary runs a batch inside a
	 * transaction (ADR 0027).
	 */
	renew: procedure.member
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

				await reconcileTouched(ctx.db, now, { contractIds: [created.id] });

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

			await reconcileTouched(ctx.db, now, { contractIds: [created.id], unitIds });

			return serializeContract(created);
		}),

	update: procedure.member
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			ensureContractIsNotTerminated(existingContract.status);

			const tenant = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.id, input.tenantId))
				.get();

			if (!tenant) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'tenant does not exist'
				});
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

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(updated);
		}),

	terminate: procedure.member
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractTerminable(deriveContractStatus(existingContract, payments, now));

			const terminated = await ctx.db
				.update(s.contract)
				.set({ status: 'terminated' })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(terminated);
		}),

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
	planMany: procedure.member
		.input(
			z.object({
				ids: z.array(ContractSchema.shape.id).min(1),
				action: ContractSelectionActionSchema
			})
		)
		.query(async ({ input, ctx }) => {
			const plan = await planContractSelection(ctx.db, ctx.clock.now(), input.ids, input.action);

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
	terminateMany: procedure.member
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planContractSelection(ctx.db, now, input.ids, 'terminate');
			const terminableIds = plan.eligible.map((contract) => contract.id);

			if (terminableIds.length) {
				await ctx.db
					.update(s.contract)
					.set({ status: 'terminated' })
					.where(inArray(s.contract.id, terminableIds));
			}

			// the one pass, over every contract that changed. This is the line the ticket's
			// assertion is about, and the reason the plan above collects rather than acting.
			await reconcileTouched(ctx.db, now, { contractIds: terminableIds });

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
	unterminateMany: procedure.member
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const plan = await planContractSelection(ctx.db, now, input.ids, 'restore');

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

			await reconcileTouched(ctx.db, now, {
				contractIds: plan.eligible.map((contract) => contract.id)
			});

			return { unterminated: plan.eligible.map(toChangedContract), refused: plan.refused };
		}),

	unterminate: procedure.member
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
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

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(restored);
		}),

	delete: procedure.member
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

			const units = await ctx.db
				.select()
				.from(s.contractUnit)
				.where(eq(s.contractUnit.contractId, input.id));
			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractDeletable(units, payments);

			const deleted = await ctx.db
				.delete(s.contract)
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			return deleted ? serializeContract(deleted) : deleted;
		}),

	/**
	 * Delete every contract in the selection that nothing depends on, and name the rest.
	 *
	 * The deleted rows come back whole rather than as ids, because that is what putting them back
	 * needs: an undo restores each record as itself, by its own identity (ADR 0026), and once the
	 * rows are gone there is nothing left to read them from.
	 *
	 * **No reconcile pass.** A contract that may be deleted at all holds no unit and carries no
	 * payment, so nothing derived was resting on it — which is the same reason the single-record
	 * deletion beside it runs none.
	 */
	deleteMany: procedure.member
		.use(autosync())
		.input(z.object({ ids: z.array(ContractSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const plan = await planContractSelection(ctx.db, ctx.clock.now(), input.ids, 'delete');
			const deletableIds = plan.eligible.map((contract) => contract.id);

			if (deletableIds.length) {
				await ctx.db.delete(s.contract).where(inArray(s.contract.id, deletableIds));
			}

			return {
				deleted: plan.eligible.map((contract) => serializeContract(contract)),
				refused: plan.refused
			};
		}),

	/**
	 * Put a set of contracts back, all of them or none.
	 *
	 * What undoing {@link deleteMany} calls, and the reason it is all or nothing: a set half
	 * restored leaves the workspace in a shape neither the deletion nor the undo describes. One
	 * batch, and the boundary runs a batch inside one transaction (ADR 0027), so a refusal
	 * anywhere in the set creates nothing.
	 *
	 * **It throws rather than reporting**, which is what leaves the entry on the undo stack: an
	 * inverse that threw did not move the workspace, so the reader can deal with whatever refused
	 * it and press undo again. Every refusal names the contract it is about, because *one of them
	 * could not be put back* is not something a reader can act on.
	 *
	 * Every check `create` makes, asked once for the whole set rather than once per contract.
	 */
	createMany: procedure.member
		.use(autosync())
		.input(z.object({ contracts: z.array(ContractCreateSchema).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			for (const contract of input.contracts) {
				ensureValidContractInput(contract);
			}

			const named = input.contracts.map((contract) => ({
				...contract,
				id: contract.id ?? newId(),
				govId: contract.govId?.trim() || null
			}));
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `two contracts in this set claim ${repeated}`
				});
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
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `tenant ${missingTenant} does not exist`
				});
			}

			const taken = govIds.length
				? await ctx.db.select().from(s.contract).where(inArray(s.contract.govId, govIds))
				: [];

			ensureGovIdAvailable(taken[0], taken[0]?.govId ?? undefined);

			// annotated rather than inferred: a derived status is a union of string literals, and an
			// object literal built without something expecting that union widens the property to
			// `string`. The single-record creation is spared it by handing its literal straight to
			// `values`, which is the expectation this restores.
			const values: (typeof s.contract.$inferInsert)[] = named.map((contract) => {
				const shape = {
					status: 'active' as const,
					start: new Date(contract.start),
					end: new Date(contract.end),
					interval: contract.interval,
					cost: contract.cost
				};
				const { paidAmount, expectedAmount } = getContractPaymentSummary(shape, []);
				const status = deriveContractStatus(shape, [], now);

				return {
					...contract,
					govId: contract.govId,
					status,
					paidAmount,
					expectedAmount,
					start: shape.start,
					end: shape.end
				};
			});

			const [first, ...rest] = values.map((value) =>
				ctx.db.insert(s.contract).values(value).returning()
			);
			const created = await ctx.db.batch([first, ...rest]);

			await reconcileTouched(ctx.db, now, { contractIds: ids });

			return created.map(([contract]) => serializeContract(contract));
		}),

	/** The contracts a palette search reaches, by reference or by the tenant holding them. */
	search: procedure.member
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			const rows = await ctx.db
				.select({ id: s.contract.id, govId: s.contract.govId, tenantName: s.tenant.name })
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(matchesAnySearch([s.contract.govId, s.tenant.name], input.term))
				.orderBy(desc(s.contract.id))
				.limit(input.limit);

			// a contract's reference is optional, so the tenant holding it is the handle whenever
			// there is no reference to show.
			return rows.map((row) => ({
				id: row.id,
				label: row.govId ?? row.tenantName,
				hint: row.tenantName
			}));
		}),

	get: procedure.member
		.input(ContractSchema.pick({ id: true, govId: true }).partial())
		.query(async ({ input, ctx }) => {
			if (input.id) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.id))
					.get();

				return contract ? serializeContract(contract) : undefined;
			}

			if (input.govId) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.govId, input.govId))
					.get();

				return contract ? serializeContract(contract) : undefined;
			}

			return undefined;
		}),

	// the contracts directory, in one bounded query: the whole result set for a search, in the
	// order the sort control chose. The list renders what arrives and orders nothing itself.
	getMany: procedure.member
		.input(
			z.object({
				search: z.string().optional(),
				sort: ContractSortSchema.optional(),
				// narrows the list to one attention rank, so a surface that ranked a contract has
				// somewhere to send the reader that still knows the rank (ADR 0031). It is not a
				// plain `where`: a rank is decided from what the contract owes *today*, which is
				// expected-by-now minus the materialized paid amount, and no column holds that.
				// What the rank *implies* about the stored columns is a `where`, and the query
				// narrows on that before the rank itself decides what is left.
				rank: z.enum(CONTRACT_RANKS).optional(),
				// narrows the list to one tenant's contracts, for the surface that asks what a
				// person rents. Filtered here rather than by the caller: a directory that loaded
				// every contract to keep one tenant's would be the client-side narrowing
				// ADR 0010 exists to refuse.
				tenantId: z.string().optional(),
				// the same, for the surface that asks what has been agreed over one unit. It
				// matches through the assignment table rather than joining it, so a contract
				// holding several units is still one row.
				unitId: z.string().optional(),
				// and the same again for a whole building, for the record that says how much runs
				// against it. Reachable no other way: a record that loaded every contract to keep
				// its own would be the client-side narrowing ADR 0010 refuses.
				complexId: z.string().optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

			// one instant for the narrowing and for the ranking below it. Taken twice, a contract
			// whose rank turns over at a UTC day boundary can be read under one day and judged
			// under the next, and then it is missing from both lists.
			const now = ctx.clock.now();
			const endingSoonNoticeDays = input.rank
				? (await ctx.host.settings.get()).endingSoonNoticeDays
				: undefined;
			const rankBounds = input.rank
				? getContractRankBounds(input.rank, now, endingSoonNoticeDays)
				: undefined;

			const contracts = await ctx.db
				.select({
					contract: s.contract,
					tenantName: s.tenant.name,
					tenantPhone: s.tenant.phone,
					paymentCount: contractPaymentCount.as('paymentCount')
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(
					and(
						input.tenantId !== undefined ? eq(s.contract.tenantId, input.tenantId) : undefined,
						input.unitId !== undefined ? contractHoldsUnit(input.unitId) : undefined,
						input.complexId !== undefined ? contractHoldsUnitInComplex(input.complexId) : undefined,
						search ? matchesAnySearch(CONTRACT_SEARCH_COLUMNS, search) : undefined,
						rankBounds ? matchesRankBounds(rankBounds) : undefined
					)
				)
				.orderBy(...contractOrderBy(input.sort));

			const listed = contracts.map(({ contract, tenantName, tenantPhone, paymentCount }) => ({
				...serializeContract(contract, tenantName, tenantPhone),
				paymentCount
			}));

			if (!input.rank) {
				return listed;
			}

			// held as a const: the narrowing above does not survive into the closure below.
			const wantedRank = input.rank;

			// what the bounds could not decide. They narrow to a superset of the rank — every
			// contract the rank holds is in the read, and some that it does not — so this pass
			// is the rank itself applied to what came back, over a set the size of the rank
			// rather than the size of the table. One query per state (ADR 0010) still holds.
			const ranked = listed.flatMap((contract) => {
				const outstandingAmount = Math.max(
					getExpectedAmountBy(contract, now) - contract.paidAmount,
					0
				);
				const rank = getContractRank(
					contract.status,
					contract.end,
					outstandingAmount,
					now,
					endingSoonNoticeDays
				);

				if (rank !== wantedRank) {
					return [];
				}

				const order: ContractRankOrder = {
					rank,
					outstandingAmount,
					contractEnd: contract.end,
					// the list joins its tenant, so the name is always there; the serialized shape
					// is the one that admits it might not be.
					tenantName: contract.tenantName ?? ''
				};

				return [{ contract, order }];
			});

			// a chosen sort is the reader's and wins. With none, the rank's own follow-up order
			// applies, because that order is part of what the rank means (ADR 0031).
			if (!input.sort) {
				ranked.sort((left, right) => compareContractsByRank(left.order, right.order));
			}

			return ranked.map(({ contract }) => contract);
		}),

	units: {
		getMany: procedure.member.input(ContractUnitsGetManySchema).query(async ({ input, ctx }) => {
			return await selectContractUnits(ctx.db, input.contractId, ctx.clock.now());
		}),

		/**
		 * Every unit this contract may hold, whether or not it holds it — both panes of the
		 * transfer surface, for one search.
		 *
		 * The search narrows in SQL, over the unit's name and the name of the complex holding
		 * it, so the surface never receives a wider set to filter. Units held by a contract
		 * whose term overlaps this one are left out: they are not this contract's to take, so
		 * offering them would be offering a refusal.
		 */
		getAssignableMany: procedure.member
			.input(ContractAssignableUnitsSchema)
			.query(async ({ input, ctx }) => {
				const now = ctx.clock.now();
				const contract = await selectContract(ctx.db, input.contractId);
				const search = input.search?.trim();

				const units = await ctx.db
					.select({
						id: s.unit.id,
						name: s.unit.name,
						complexId: s.unit.complexId,
						complexName: s.complex.name
					})
					.from(s.unit)
					.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
					.where(search ? matchesAnySearch([s.unit.name, s.complex.name], search) : undefined)
					.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id));

				const unitIds = units.map((unit) => unit.id);

				if (unitIds.length === 0) {
					return units.map((unit) => ({
						...unit,
						status: 'vacant' as const,
						isAssigned: false
					}));
				}

				const assignments = await selectAssignmentsForUnits(ctx.db, unitIds);
				const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
				const payments = contractIds.length
					? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
					: [];
				const statusByUnitId = deriveUnitStatuses(
					unitIds,
					assignments,
					groupPaymentsByContractId(payments),
					now
				);
				const conflictingUnitIds = getConflictingAssignedUnitIds(
					assignments,
					contract,
					input.contractId
				);
				const assignedUnitIds = new Set(
					assignments
						.filter((assignment) => assignment.contractId === input.contractId)
						.map((assignment) => assignment.unitId)
				);

				return units
					.filter((unit) => !conflictingUnitIds.has(unit.id))
					.map((unit) => ({
						...unit,
						status: statusByUnitId.get(unit.id) ?? 'vacant',
						isAssigned: assignedUnitIds.has(unit.id)
					}));
			}),

		/**
		 * Make the contract's units exactly this set.
		 *
		 * A set rather than an addition, because the surface that writes it expresses removal too
		 * and commits both directions at once (ADR 0024). Every unit named must exist and be free
		 * of an overlapping contract; the locks on a terminated contract and one with a payment
		 * recorded refuse the whole call, as they always did.
		 */
		set: procedure.member
			.use(autosync())
			.input(ContractUnitsSetSchema)
			.mutation(async ({ input, ctx }) => {
				const now = ctx.clock.now();
				const contract = await selectContract(ctx.db, input.contractId);

				ensureContractIsNotTerminated(contract.status);
				ensureContractUnitsAreMutable(await selectPaymentsForContract(ctx.db, input.contractId));

				const nextUnitIds = [...new Set(input.unitIds)];
				const units = nextUnitIds.length
					? await ctx.db.select().from(s.unit).where(inArray(s.unit.id, nextUnitIds))
					: [];

				if (units.length !== nextUnitIds.length) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'one or more units could not be found'
					});
				}

				const held = await ctx.db
					.select()
					.from(s.contractUnit)
					.where(eq(s.contractUnit.contractId, input.contractId));
				const heldUnitIds = new Set(held.map((assignment) => assignment.unitId));
				const added = nextUnitIds.filter((unitId) => !heldUnitIds.has(unitId));
				const removed = [...heldUnitIds].filter((unitId) => !nextUnitIds.includes(unitId));

				// only what is arriving is checked: a unit the contract already holds cannot
				// conflict with the contract holding it.
				if (added.length) {
					ensureUnitsAssignable(
						await selectAssignmentsForUnits(ctx.db, added),
						contract,
						input.contractId
					);
				}

				for (const unitId of added) {
					await ctx.db.insert(s.contractUnit).values({ contractId: input.contractId, unitId });
				}

				if (removed.length) {
					await ctx.db
						.delete(s.contractUnit)
						.where(
							and(
								eq(s.contractUnit.contractId, input.contractId),
								inArray(s.contractUnit.unitId, removed)
							)
						);
				}

				// a unit that left is no longer reachable through the contract's assignments, so it
				// is named for the reconcile that has to recompute its status.
				await reconcileTouched(ctx.db, now, {
					contractIds: [input.contractId],
					unitIds: [...new Set([...nextUnitIds, ...removed])]
				});

				return await selectContractUnits(ctx.db, input.contractId, now);
			})
	},

	payments: payment,

	dashboard
});
