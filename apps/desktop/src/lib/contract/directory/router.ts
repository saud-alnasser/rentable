import {
	matchesAnySearch,
	RecordSearchSchema,
	type RecordMatch
} from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { procedure, router } from '$lib/api/trpc';
import {
	CONTRACT_ATTENTION_ORDER,
	CONTRACT_SORT_COLUMN_IDS,
	type ContractSortColumnId
} from '$lib/contract/contract';
import {
	CONTRACT_RANKS,
	compareContractsByRank,
	getContractRankBounds,
	getDueSoonCycle,
	type ContractRankBounds,
	type ContractRankOrder
} from '$lib/contract/rank/rank';
import { getExpectedAmountBy } from '$lib/contract/schedule/cycle';
import { serializeContract, withRank } from '$lib/contract/serialize';
import { permits } from '@rentable/workspace-permission';
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

/**
 * THE CONTRACTS DIRECTORY
 *
 * `contract.getMany`, the list every surface listing contracts reads, narrowed, searched,
 * ordered and ranked in the query, and `contract.search`, what the command menu reaches. Composed
 * into the contract's router at its root.
 */

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
// A rank cannot be a `where` (it is decided from what a contract owes today, which no column
// holds), but everything a rank *implies* about the stored columns can be, and rank/rank.ts states
// exactly that as bounds. Narrowing on them turns the read from the whole table into a superset
// of the rank, small enough that deciding the rest in TypeScript costs what a rank filter should.
//
// Translation only: which bounds a rank has is the ranking's, and adding one here that rank/rank.ts
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
function contractOrderBy(
	chosenSort: z.infer<typeof ContractSortSchema> | undefined,
	viewsTenant: boolean
): SQL[] {
	// a member who may not view tenants is not ordered by them either, since an order by a name
	// they are not shown is that name told another way (effort 838, requirement 10).
	const order = viewsTenant
		? CONTRACT_DIRECTORY_ORDER
		: CONTRACT_DIRECTORY_ORDER.filter(({ columnId }) => columnId !== 'tenantName');
	const sort = chosenSort?.columnId === 'tenantName' && !viewsTenant ? undefined : chosenSort;

	if (!sort) {
		return order.map(({ term }) => term);
	}

	const column = CONTRACT_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return [
		chosen,
		...order.filter(({ columnId }) => columnId !== sort.columnId).map(({ term }) => term)
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

// the same, less the tenant's fields, for a member who may not view tenants (effort 838,
// requirement 10): a contract found by a name they are not shown would tell them whose it is.
const TENANT_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [s.tenant.name, s.tenant.phone];

const contractSearchColumns = (viewsTenant: boolean) =>
	viewsTenant
		? CONTRACT_SEARCH_COLUMNS
		: CONTRACT_SEARCH_COLUMNS.filter((column) => !TENANT_SEARCH_COLUMNS.includes(column));

export default router({
	/** The contracts a palette search reaches, by reference or by the tenant holding them. */
	search: procedure
		.permitted('viewContract')
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			// a member who may not view tenants reaches a contract by its reference alone, and is
			// shown no tenant beside it (effort 838, requirement 10).
			const viewsTenant = permits(ctx.identity.permissions, 'viewTenant');
			const rows = await ctx.db
				.select({ id: s.contract.id, govId: s.contract.govId, tenantName: s.tenant.name })
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(
					matchesAnySearch(
						viewsTenant ? [s.contract.govId, s.tenant.name] : [s.contract.govId],
						input.term
					)
				)
				.orderBy(desc(s.contract.id))
				.limit(input.limit);

			// a contract's reference is optional, so the tenant holding it is the handle whenever
			// there is no reference to show. Without the tenant, the match was made on the
			// reference, so there is one.
			return rows.map((row) => ({
				id: row.id,
				label: row.govId ?? (viewsTenant ? row.tenantName : ''),
				hint: viewsTenant ? row.tenantName : ''
			}));
		}),

	// the contracts directory, in one bounded query: the whole result set for a search, in the
	// order the sort control chose. The list renders what arrives and orders nothing itself.
	getMany: procedure
		.permitted('viewContract')
		.input(
			z.object({
				search: z.string().optional(),
				sort: ContractSortSchema.optional(),
				// narrows the list to one attention rank, so a surface that ranked a contract has
				// somewhere to send the reader that still knows the rank (ADR 0031). It is not a
				// plain `where`: a rank is decided from what the contract owes *today*, which is
				// expected-by-now minus the materialized paid amount, and from the cycle it has
				// coming due, and no column holds either.
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
			// read whether or not a rank was asked for: every row carries the rank it is filed
			// under, which its acts gate on.
			const { endingSoonNoticeDays } = await ctx.host.settings.get();
			const rankBounds = input.rank
				? getContractRankBounds(input.rank, now, endingSoonNoticeDays)
				: undefined;
			// a row carries its tenant only to a member who may view tenants, and its count of
			// payments only to one who may view payments (effort 838, requirement 10).
			const viewsTenant = permits(ctx.identity.permissions, 'viewTenant');
			const viewsPayment = permits(ctx.identity.permissions, 'viewPayment');

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
						search ? matchesAnySearch(contractSearchColumns(viewsTenant), search) : undefined,
						rankBounds ? matchesRankBounds(rankBounds) : undefined
					)
				)
				.orderBy(...contractOrderBy(input.sort, viewsTenant));

			const listed = contracts.map(({ contract, tenantName, tenantPhone, paymentCount }) =>
				withRank(
					{
						...(viewsTenant
							? serializeContract(contract, tenantName, tenantPhone)
							: serializeContract(contract)),
						...(viewsPayment ? { paymentCount } : {})
					},
					now,
					endingSoonNoticeDays
				)
			);

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
				const rank = contract.rank;

				if (rank !== wantedRank) {
					return [];
				}

				const order: ContractRankOrder = {
					rank,
					outstandingAmount,
					contractEnd: contract.end,
					// the list joins its tenant, so the name is there wherever the member may view
					// tenants; without it the rank's order falls through to what is left.
					tenantName: contract.tenantName ?? '',
					nextDue:
						rank === 'due-soon'
							? getDueSoonCycle(contract, contract.paidAmount, now)?.due.getTime()
							: undefined
				};

				return [{ contract, order }];
			});

			// a chosen sort is the reader's and wins. With none, the rank's own follow-up order
			// applies, because that order is part of what the rank means (ADR 0031).
			if (!input.sort) {
				ranked.sort((left, right) => compareContractsByRank(left.order, right.order));
			}

			return ranked.map(({ contract }) => contract);
		})
});
