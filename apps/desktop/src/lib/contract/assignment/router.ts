import { reconcileTouched, type Settling } from '$lib/contract/reconcile';
import { matchesAnySearch } from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	ensureContractIsNotTerminated,
	ensureContractUnitsAreMutable
} from '$lib/contract/contract';
import {
	selectAssignmentsForUnits,
	selectContract,
	selectPaymentsForContract
} from '$lib/contract/row';
import { permits } from '@rentable/workspace-permission';
import { and, asc, eq, inArray } from 'drizzle-orm';
import z from 'zod';
import {
	deriveUnitStatuses,
	ensureUnitsAssignable,
	getConflictingAssignedUnitIds
} from './assignment';

/**
 * THE UNITS A CONTRACT HOLDS
 *
 * the contract's `units` procedures: the units it holds, every unit it may hold, every unit a
 * contract not yet created may hold over a term, and making its units exactly a set. Mounted
 * under `units` by the contract's router, so each is `contract.units.<name>`.
 */

const ContractUnitsGetManySchema = z.object({ contractId: z.string() });
const ContractAssignableUnitsSchema = z.object({
	contractId: z.string(),
	search: z.string().optional()
});
// the term a contract not yet created would run for, which is all the conflict rule reads.
const TermAssignableUnitsSchema = ContractSchema.pick({ start: true, end: true }).extend({
	search: z.string().optional()
});
// the whole set, not an addition to it: an empty array is the contract holding no units, which
// is what removing the last one means.
const ContractUnitsSetSchema = z.object({
	contractId: z.string(),
	unitIds: z.array(z.string())
});

/**
 * Every unit, narrowed by a search over its name and its complex's, with the assignments the
 * units hold and each one's derived status: what both assignable reads start from before they
 * apply the conflict rule.
 */
async function selectUnitsWithAssignments(
	ctx: Settling,
	search: string | undefined,
	now: number,
	viewsComplex: boolean
) {
	const { db } = ctx;
	const term = search?.trim();

	const rows = await db
		.select({
			id: s.unit.id,
			name: s.unit.name,
			complexId: s.unit.complexId,
			complexName: s.complex.name
		})
		.from(s.unit)
		.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
		.where(
			term
				? matchesAnySearch(viewsComplex ? [s.unit.name, s.complex.name] : [s.unit.name], term)
				: undefined
		)
		.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id));
	const units = rows.map((unit) => withComplexName(unit, viewsComplex));

	const unitIds = units.map((unit) => unit.id);
	const assignments = await selectAssignmentsForUnits(db, unitIds);
	const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
	const statusByUnitId = deriveUnitStatuses(
		unitIds,
		assignments,
		await ctx.contributions.contract.paymentsOf(db, contractIds),
		now
	);

	return { units, assignments, statusByUnitId };
}

/**
 * A unit as a contract's reads answer with it: the complex holding it is named only to a member who
 * may view complexes (effort 838, requirement 10), and left off, rather than blank, otherwise.
 */
function withComplexName<T extends { complexName: string }>(
	{ complexName, ...unit }: T,
	viewsComplex: boolean
): Omit<T, 'complexName'> & { complexName?: string } {
	return viewsComplex ? { ...unit, complexName } : unit;
}

// the units a contract holds, each carrying the complex holding it and its derived status —
// the shape both the directory that reads them and the surface that writes them answer with.
async function selectContractUnits(
	ctx: Settling,
	contractId: string,
	now: number,
	viewsComplex: boolean
) {
	const { db } = ctx;
	const rows = await db
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
	const units = rows.map((unit) => withComplexName(unit, viewsComplex));

	const unitIds = [...new Set(units.map((unit) => unit.id))];

	// the empty case returns the same shape as the full one rather than the bare rows: a
	// procedure whose result type depends on how many rows it found makes every caller handle a
	// shape it can never actually observe.
	if (unitIds.length === 0) {
		return units.map((unit) => ({ ...unit, status: 'vacant' as const }));
	}

	const assignments = await selectAssignmentsForUnits(db, unitIds);
	const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
	const statusByUnitId = deriveUnitStatuses(
		unitIds,
		assignments,
		await ctx.contributions.contract.paymentsOf(db, contractIds),
		now
	);

	return units.map((unit) => ({
		...unit,
		status: statusByUnitId.get(unit.id) ?? 'vacant'
	}));
}

export default router({
	getMany: procedure
		.permitted('viewUnit')
		.input(ContractUnitsGetManySchema)
		.query(async ({ input, ctx }) => {
			return await selectContractUnits(
				ctx,
				input.contractId,
				ctx.clock.now(),
				permits(ctx.identity.permissions, 'viewComplex')
			);
		}),

	/**
	 * Every unit this contract may hold, whether or not it holds it — both panes of the
	 * transfer surface, for one search.
	 *
	 * The search narrows in SQL, over the unit's name and the name of the complex holding
	 * it, so the surface never receives a wider set to filter. Units held by a contract
	 * whose term overlaps this one are left out: they are not this contract's to take, so
	 * offering them would be offering a refusal. A unit this contract holds is kept even
	 * then, because the held pane lists what the contract holds.
	 */
	getAssignableMany: procedure
		.permitted('viewUnit')
		.input(ContractAssignableUnitsSchema)
		.query(async ({ input, ctx }) => {
			const contract = await selectContract(ctx.db, input.contractId);
			const { units, assignments, statusByUnitId } = await selectUnitsWithAssignments(
				ctx,
				input.search,
				ctx.clock.now(),
				permits(ctx.identity.permissions, 'viewComplex')
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

			// a unit this contract holds is always listed, even where an overlapping contract
			// holds it too: the held pane must show what a delete refusal counts.
			return units
				.filter((unit) => assignedUnitIds.has(unit.id) || !conflictingUnitIds.has(unit.id))
				.map((unit) => ({
					...unit,
					status: statusByUnitId.get(unit.id) ?? 'vacant',
					isAssigned: assignedUnitIds.has(unit.id)
				}));
		}),

	/**
	 * Every unit a contract not yet created may hold over this term: what the contract form
	 * offers before there is a contract to ask {@link getAssignableMany} about.
	 *
	 * The same conflict rule, with no contract of its own to exempt: a unit a contract holds
	 * over an overlapping term is left out, because offering it would be offering a refusal.
	 */
	getAssignableForTerm: procedure
		.permitted('viewUnit')
		.input(TermAssignableUnitsSchema)
		.query(async ({ input, ctx }) => {
			const { units, assignments, statusByUnitId } = await selectUnitsWithAssignments(
				ctx,
				input.search,
				ctx.clock.now(),
				permits(ctx.identity.permissions, 'viewComplex')
			);
			const conflictingUnitIds = getConflictingAssignedUnitIds(assignments, input, '');

			return units
				.filter((unit) => !conflictingUnitIds.has(unit.id))
				.map((unit) => ({ ...unit, status: statusByUnitId.get(unit.id) ?? 'vacant' }));
		}),

	/**
	 * Make the contract's units exactly this set.
	 *
	 * A set rather than an addition, because the surface that writes it expresses removal too
	 * and commits both directions at once (ADR 0024). Every unit named must exist and be free
	 * of an overlapping contract; the locks on a terminated contract and one with a payment
	 * recorded refuse the whole call, as they always did.
	 */
	set: procedure
		.permitted('editContract')
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
				throw refuse('contract.unitsMissing');
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
			await reconcileTouched(ctx, now, {
				contractIds: [input.contractId],
				unitIds: [...new Set([...nextUnitIds, ...removed])]
			});

			return await selectContractUnits(
				ctx,
				input.contractId,
				now,
				permits(ctx.identity.permissions, 'viewComplex')
			);
		})
});
