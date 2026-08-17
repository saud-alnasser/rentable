import type { Database } from '$lib/api/context';
import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { matchesAnySearch } from '$lib/platform/database/search';
import { ensureIdFree } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	CONTRACT_ATTENTION_ORDER,
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
	hasSameUtcDateRange
} from '$lib/contract/contract';
import {
	CONTRACT_RANKS,
	compareContractsByRank,
	getContractRank,
	type ContractRankOrder
} from '$lib/contract/rank';
import { ensureRenewalFollowsPredecessor } from '$lib/contract/renewal';
import { reconcileTouched } from '$lib/contract/reconcile';
import { serializeContract } from '$lib/contract/serialize';
import dashboard from '$lib/dashboard/router';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import payment from '$lib/payment/router';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, max, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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
	contractId: z.number(),
	id: z.number().optional()
});

const ContractUnitsGetManySchema = z.object({ contractId: z.number() });
const ContractAssignableUnitsSchema = z.object({
	contractId: z.number(),
	search: z.string().optional()
});
// the whole set, not an addition to it: an empty array is the contract holding no units, which
// is what removing the last one means.
const ContractUnitsSetSchema = z.object({
	contractId: z.number(),
	unitIds: z.array(z.number())
});

// fetches the assignment rows (joined with their contracts) for the given units — the
// shape every derivation and overlap rule takes.
async function selectAssignmentsForUnits(db: Database, unitIds: number[]) {
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
async function selectPaymentsForContract(db: Database, contractId: number) {
	return await db.select().from(s.payment).where(eq(s.payment.contractId, contractId));
}

// the contract a unit procedure is about, refused rather than returned absent: every one of
// them reads a rule off it, and there is no answer to give for a contract that is not there.
async function selectContract(db: Database, contractId: number) {
	const contract = await db.select().from(s.contract).where(eq(s.contract.id, contractId)).get();

	if (!contract) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'contract does not exist' });
	}

	return contract;
}

// the units a contract holds, each carrying the complex holding it and its derived status —
// the shape both the directory that reads them and the surface that writes them answer with.
async function selectContractUnits(db: Database, contractId: number, now: number) {
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
const contractPaymentCount = sql<number>`(
	select count(*) from ${s.payment} where ${s.payment.contractId} = ${s.contract.id}
)`;

// Whether the contract has the given unit assigned to it, as an EXISTS rather than a join:
// joining the assignment table would multiply a contract holding several units into one row
// per unit, and the list's own ordering has no way to tell those apart.
const contractHoldsUnit = (unitId: number) => sql`exists (
	select 1 from ${s.contractUnit}
	where ${s.contractUnit.contractId} = ${s.contract.id} and ${s.contractUnit.unitId} = ${unitId}
)`;

// The same question one join further out: whether the contract holds any unit in the given
// complex. An EXISTS for the same reason — a contract holding three units in the complex would
// otherwise become three rows, and the list's ordering cannot tell those apart.
const contractHoldsUnitInComplex = (complexId: number) => sql`exists (
	select 1 from ${s.contractUnit}
	inner join ${s.unit} on ${s.unit.id} = ${s.contractUnit.unitId}
	where ${s.contractUnit.contractId} = ${s.contract.id} and ${s.unit.complexId} = ${complexId}
)`;

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
	create: procedure.public
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
	renew: procedure.public
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
			ensureUnitsAssignable(await selectAssignmentsForUnits(ctx.db, unitIds), successor, 0);

			const contractShape = {
				status: 'active' as const,
				start: new Date(successor.start),
				end: new Date(successor.end),
				interval: successor.interval,
				cost: successor.cost
			};
			const initialStatus = deriveContractStatus(contractShape, [], now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(contractShape, []);
			// typed as the row being written rather than left to inference: a derived status read
			// out of a variable widens to `string` in a standalone object, where the same value
			// passed straight to `values()` keeps the union the column is declared with.
			const values: typeof s.contract.$inferInsert = {
				...successor,
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

			// the assignment rows name the successor by an identity resolved before the batch is
			// built, because a batch cannot branch on its own results and a contract has no
			// required unique field to look the inserted row back up by — the complex that names
			// its units by its own name has one, and this does not. `last_insert_rowid()` is not
			// that identity either: every assignment row inserted after the contract replaces it.
			// The engine's own rule is the next id above the highest in use, which is the rule
			// `ensureIdFree` is written against, so stating it changes nothing about the row.
			const highestId = await ctx.db
				.select({ value: max(s.contract.id) })
				.from(s.contract)
				.get();
			const successorId = successor.id ?? (highestId?.value ?? 0) + 1;

			const [[created]] = await ctx.db.batch([
				ctx.db
					.insert(s.contract)
					.values({ ...values, id: successorId })
					.returning(),
				...unitIds.map((unitId) =>
					ctx.db.insert(s.contractUnit).values({ contractId: successorId, unitId }).returning()
				)
			]);

			await reconcileTouched(ctx.db, now, { contractIds: [created.id], unitIds });

			return serializeContract(created);
		}),

	update: procedure.public
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

	terminate: procedure.public
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

	unterminate: procedure.public
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

	delete: procedure.public
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

	/** The contracts a palette search reaches, by reference or by the tenant holding them. */
	search: procedure.public
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

	get: procedure.public
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
	getMany: procedure.public
		.input(
			z.object({
				search: z.string().optional(),
				sort: ContractSortSchema.optional(),
				// narrows the list to one attention rank, so a surface that ranked a contract has
				// somewhere to send the reader that still knows the rank (ADR 0031). It cannot be a
				// `where`: a rank is decided from what the contract owes *today*, which is expected
				// -by-now minus the materialized paid amount, and no column holds that.
				rank: z.enum(CONTRACT_RANKS).optional(),
				// narrows the list to one tenant's contracts, for the surface that asks what a
				// person rents. Filtered here rather than by the caller: a directory that loaded
				// every contract to keep one tenant's would be the client-side narrowing
				// ADR 0010 exists to refuse.
				tenantId: z.number().optional(),
				// the same, for the surface that asks what has been agreed over one unit. It
				// matches through the assignment table rather than joining it, so a contract
				// holding several units is still one row.
				unitId: z.number().optional(),
				// and the same again for a whole building, for the record that says how much runs
				// against it. Reachable no other way: a record that loaded every contract to keep
				// its own would be the client-side narrowing ADR 0010 refuses.
				complexId: z.number().optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

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
						search ? matchesAnySearch(CONTRACT_SEARCH_COLUMNS, search) : undefined
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

			// the rank is derived rather than stored, so this pass is what a `where` would have
			// been. It costs one arithmetic step per row already read and returns fewer of them
			// than the unfiltered list does — the read itself is unchanged, and ADR 0010's one
			// query per state still holds.
			const now = ctx.clock.now();
			const { endingSoonNoticeDays } = await ctx.host.settings.get();

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
		getMany: procedure.public.input(ContractUnitsGetManySchema).query(async ({ input, ctx }) => {
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
		getAssignableMany: procedure.public
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
		set: procedure.public
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
