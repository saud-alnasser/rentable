import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import { ContractSchema, type Contract } from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { fromIsoDay } from '$lib/date';
import {
	defineSheet,
	toStatedNumber,
	toContractReferences,
	toGovIdFromReference,
	toTransferKey,
	toUnitParts,
	toUnitReference,
	UNIT_LIST_SEPARATOR
} from '$lib/transfer';
import { refuse } from '$lib/api/refusal';
import { asc, eq, inArray, ne } from 'drizzle-orm';
import z from 'zod';
import { getConflictingAssignedUnitIds, rangesOverlap } from './assignment/assignment';
import { ensureGovIdAvailable, ensureValidContractInput, hasValidContractCost } from './contract';
import { contractsHoldingGovId, selectAssignmentsForUnits } from './row';
import { hasValidContractPeriodForInterval } from './schedule/cycle';
import { contractStatusesAt, reconcileTouched } from './reconcile';

/**
 * THE CONTRACTS SHEET
 *
 * what a workspace file holds of the contracts, and how they are read back (`$lib/transfer`). A
 * contract names its tenant and the units it holds, which the file or the workspace has to
 * answer; a payment names a contract by its reference. What the file cannot carry, a contract's
 * amounts and every status but a termination, is recomputed once the write has landed (`settle`).
 *
 * **A terminated contract stays terminated.** It is the one status a person sets, so a file that
 * says it is read back as it was. Its payments are written before the status lands, at the end of
 * the same batch (`Written.closing`), because a terminated contract takes no payment.
 *
 * **A unit is held by one live contract over any day**, here as on every other way in. A row
 * naming a unit twice is refused on its own (`validate`); a row taking a unit another row or a
 * held live contract takes over the same days is found through `claims` in the plan and refused
 * again by the write. A terminated contract keeps its units and claims none of them.
 */

/** A contract, as a file holds one. */
export type TransferContract = {
	reference: string;
	/** the tenant's national id. */
	tenant: string;
	/** the units it holds, each as its own reference. */
	units: string[];
	start: number;
	end: number;
	interval: Contract['interval'];
	cost: number;
	status: Contract['status'];
	paidAmount: number;
	expectedAmount: number;
};

/** a row of the sheet, as text, before it is a contract; its tenant is their national id. */
type ContractRow = {
	reference: string;
	nationalId: string;
	units: string;
	start: string;
	end: string;
	interval: string;
	cost: string;
	/** what the file said the contract was. Only `terminated` is read; the rest is derived. */
	status: string;
};

/** every interval a contract may run on, as the file spells them. */
const INTERVALS: readonly Contract['interval'][] = ['1m', '3m', '6m', '12m'];

/** the units a row names, one reference each. */
function namedUnits(row: ContractRow) {
	return row.units
		.split(UNIT_LIST_SEPARATOR)
		.map((value) => value.trim())
		.filter(Boolean);
}

/** the key a unit reference is compared by, which is how the transfer keys the unit itself. */
function unitKey(unit: string) {
	return toTransferKey(...toUnitParts(unit));
}

/** whether a file's status cell says the contract was terminated, in whatever case it was typed. */
function isTerminated(status: string) {
	return status.trim().toLowerCase() === 'terminated';
}

/**
 * the reference a file calls each contract by, by its id: every contract with a tenant, and never
 * a filtered part of them, since whether one needs more than its bare spelling depends on the rest.
 * The contract's own read answers with its reference too, so a ledger exported from its page names
 * it as this sheet does and reads back through the same import.
 */
export async function referencesOf(db: Database) {
	return toContractReferences(
		await db
			.select({
				id: s.contract.id,
				govId: s.contract.govId,
				start: s.contract.start,
				end: s.contract.end,
				tenant: s.tenant.nationalId
			})
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
	);
}

export default defineSheet({
	concept: 'contracts',
	order: 4,
	names: { written: 'Contracts', accepted: ['contracts', 'العقود'] },
	view: 'viewContract',
	columns: [
		{ header: 'Contract', value: (contract: TransferContract) => contract.reference },
		{ header: 'Tenant', value: (contract) => contract.tenant },
		{ header: 'Units', value: (contract) => contract.units.join(UNIT_LIST_SEPARATOR) },
		{ header: 'Start', value: (contract) => ({ kind: 'date', value: new Date(contract.start) }) },
		{ header: 'End', value: (contract) => ({ kind: 'date', value: new Date(contract.end) }) },
		{ header: 'Interval', value: (contract) => contract.interval },
		{ header: 'Cost', value: (contract) => ({ kind: 'money', value: contract.cost }) },
		{ header: 'Status', value: (contract) => contract.status },
		{ header: 'Paid', value: (contract) => ({ kind: 'money', value: contract.paidAmount }) },
		{
			header: 'Expected',
			value: (contract) => ({ kind: 'money', value: contract.expectedAmount })
		}
	],
	// a status as stored, or as the term and the payments make it now where the read derives: a
	// workspace read on Turso may hold one nobody reconciled since a day passed.
	read: async (db, deriving): Promise<TransferContract[]> => {
		const contracts = await db
			.select({
				id: s.contract.id,
				govId: s.contract.govId,
				status: s.contract.status,
				start: s.contract.start,
				end: s.contract.end,
				interval: s.contract.interval,
				cost: s.contract.cost,
				paidAmount: s.contract.paidAmount,
				expectedAmount: s.contract.expectedAmount,
				tenant: s.tenant.nationalId
			})
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
			.orderBy(asc(s.contract.start), asc(s.contract.id));
		const assignments = await db
			.select({
				contractId: s.contractUnit.contractId,
				unit: s.unit.name,
				complex: s.complex.name
			})
			.from(s.contractUnit)
			.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
			.orderBy(asc(s.complex.name), asc(s.unit.name));

		const derived =
			deriving && (await contractStatusesAt({ ...deriving, db }, deriving.now, contracts));
		const referenceOf = toContractReferences(contracts);
		const unitsOf = new Map<string, string[]>();

		for (const assignment of assignments) {
			const held = unitsOf.get(assignment.contractId) ?? [];

			held.push(toUnitReference(assignment.complex, assignment.unit));
			unitsOf.set(assignment.contractId, held);
		}

		return contracts.map((contract) => ({
			reference: referenceOf.get(contract.id)!,
			tenant: contract.tenant,
			units: unitsOf.get(contract.id) ?? [],
			start: contract.start.getTime(),
			end: contract.end.getTime(),
			interval: contract.interval,
			cost: contract.cost,
			status: derived?.get(contract.id) ?? contract.status,
			paidAmount: contract.paidAmount,
			expectedAmount: contract.expectedAmount
		}));
	},
	// contract references.
	held: async (db) => [...(await referencesOf(db)).values()],
	fields: [
		// `Government ID` is what the contracts directory calls the same column: a contract's
		// reference *is* its government number wherever it has one, and a directory of contracts
		// shows the number rather than the fallback.
		{
			id: 'reference',
			headers: ['Contract', 'العقد', 'Government ID', 'المعرف الحكومي'],
			required: true,
			identity: true
		},
		{ id: 'nationalId', headers: ['Tenant', 'المستأجر'], required: true },
		{ id: 'units', headers: ['Units', 'الوحدات'] },
		{ id: 'start', headers: ['Start', 'البداية'], required: true },
		{ id: 'end', headers: ['End', 'النهاية'], required: true },
		{ id: 'interval', headers: ['Interval', 'الدورة'], required: true },
		{ id: 'cost', headers: ['Cost', 'التكلفة'], required: true },
		// optional, so a file without the column still reads, every contract in it live.
		{ id: 'status', headers: ['Status', 'الحالة'] }
	],
	validate: (row: ContractRow) => {
		const units = namedUnits(row).map(unitKey);

		// one contract holding one unit twice is no holding the schema can store, and a file was the
		// one way in that could ask for it.
		if (new Set(units).size !== units.length) {
			return row.units;
		}

		const start = fromIsoDay(row.start);
		const end = fromIsoDay(row.end);

		if (start === undefined) {
			return row.start;
		}

		if (end === undefined) {
			return row.end;
		}

		if (end < start) {
			return row.end;
		}

		const interval = row.interval.trim() as Contract['interval'];

		if (!INTERVALS.includes(interval)) {
			return row.interval;
		}

		// the domain's own period rule, called rather than restated. A term matching no whole
		// number of cycles is refused on every other way in, and `contract/renewal/renewal.ts` states
		// outright that one cannot arise through a router; a file was the way it could.
		if (!hasValidContractPeriodForInterval({ start, end, interval })) {
			return row.end;
		}

		const cost = toStatedNumber(row.cost);

		// the domain's own cost rule, called rather than restated, exactly as the period rule
		// above is. Read here as `< 0`, this admitted a contract worth nothing.
		return cost === undefined || !hasValidContractCost(cost) ? row.cost : undefined;
	},
	references: (row) => [
		{ concept: 'tenants', values: [row.nationalId], reference: row.nationalId.trim() },
		...namedUnits(row).map((unit) => ({
			concept: 'units',
			values: toUnitParts(unit),
			reference: unit
		}))
	],
	// the validation above already answered for every one of these, which is what makes the
	// assertions safe: a row whose term or interval did not read was rejected before here.
	toRecord: (row) => ({
		reference: row.reference.trim(),
		tenant: row.nationalId.trim(),
		units: namedUnits(row),
		start: fromIsoDay(row.start) ?? 0,
		end: fromIsoDay(row.end) ?? 0,
		interval: row.interval.trim() as Contract['interval'],
		cost: toStatedNumber(row.cost) ?? 0,
		// a termination is a person's and is kept; every other status is derived, and stated here
		// only because the transfer shape is what the export writes too. Reconciliation decides it,
		// and both amounts, the moment the workspace holds the payments.
		status: isTerminated(row.status) ? ('terminated' as const) : ('active' as const),
		paidAmount: 0,
		expectedAmount: 0
	}),
	answers: {
		record: (contract) => [contract.reference],
		unknown: 'workspace.unknownContract',
		ids: async (db) =>
			[...(await referencesOf(db))].map(([id, reference]) => [[reference], id] as const)
	},
	// a live contract claims each of its units over its term; a terminated one claims none.
	claims: {
		held: async (db) => {
			const holds = await db
				.select({
					unit: s.unit.name,
					complex: s.complex.name,
					start: s.contract.start,
					end: s.contract.end
				})
				.from(s.contractUnit)
				.innerJoin(s.contract, eq(s.contractUnit.contractId, s.contract.id))
				.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
				.where(ne(s.contract.status, 'terminated'));

			return holds.map((hold) => {
				const label = toUnitReference(hold.complex, hold.unit);

				return {
					key: unitKey(label),
					label,
					start: hold.start.getTime(),
					end: hold.end.getTime()
				};
			});
		},
		of: (contract) =>
			contract.status === 'terminated'
				? []
				: contract.units.map((unit) => ({
						key: unitKey(unit),
						label: unit,
						start: contract.start,
						end: contract.end
					})),
		clash: (a, b) => rangesOverlap(a.start, a.end, b.start, b.end)
	},
	toInput: (contract) => ({
		reference: contract.reference,
		tenant: contract.tenant,
		units: contract.units,
		start: contract.start,
		end: contract.end,
		interval: contract.interval,
		cost: contract.cost,
		status: contract.status === 'terminated' ? ('terminated' as const) : ('active' as const)
	}),
	// narrowed from the schema: `start`, `end`, `interval` and `cost` are fields this write
	// persists, and the three that are left are the file's own way of naming what a row points at.
	// A status is a termination or nothing, since every other one is derived; absent, the contract
	// is live.
	input: ContractSchema.pick({ start: true, end: true, interval: true, cost: true }).extend({
		reference: z.string(),
		tenant: z.string(),
		units: z.array(z.string()),
		status: z.enum(['active', 'terminated']).optional()
	}),
	write: async (contracts, writing) => {
		const rows = contracts.map((contract) => {
			const id = newId();

			// the contract domain's own rules, asserted here as every other way of writing a
			// contract asserts them ([[rules/api-layer]], under *Where things live*). The
			// planning pass answers the same question per row so a reader is told which row is
			// at fault; this is the boundary holding whatever reached it, and without it a file
			// could write a term or a cost no other procedure would accept.
			ensureValidContractInput(contract);

			const repeated = contract.units.find(
				(unit, index) =>
					contract.units.findIndex((other) => unitKey(other) === unitKey(unit)) !== index
			);

			if (repeated !== undefined) {
				throw refuse('contract.unitRepeatedNamed', { named: repeated });
			}

			writing.name([contract.reference], id);

			return {
				id,
				// a reference that is not the fallback shape is the government number itself,
				// which is what a person calls a contract.
				govId: toGovIdFromReference(contract.reference) ?? null,
				// written live even where the file says terminated: its payments are written after
				// it, and a terminated contract takes none. The termination is `closing`'s.
				status: 'active' as const,
				start: new Date(contract.start),
				end: new Date(contract.end),
				interval: contract.interval,
				cost: contract.cost,
				paidAmount: 0,
				expectedAmount: 0,
				tenantId: writing.resolve('tenants', contract.tenant)
			};
		});

		// the plan rejected a government ID the workspace held, but one can arrive by sync before
		// the write, and no rule of the shared database refuses it any longer (effort 857,
		// requirement 14).
		const taken = await contractsHoldingGovId(
			writing.db,
			rows.map((row) => row.govId).filter((govId) => govId !== null)
		);

		ensureGovIdAvailable(taken[0], taken[0]?.govId ?? undefined);

		const held = contracts.map((contract) =>
			contract.units.map((unit) => ({
				unit,
				contractId: writing.resolve('contracts', contract.reference),
				// split back into the pair the map is keyed under, by the planning pass's own
				// splitter rather than a second one: a composed reference asked for as one value
				// could never match a two-value key, and every assignment refused the whole
				// import (#562).
				unitId: writing.resolve('units', unit, toUnitParts(unit))
			}))
		);
		const assignments = held.flat();

		// the overlap rule every other way of holding a unit asserts, over what live contracts
		// hold now and what the file's own contracts before this one hold. The plan named the row;
		// this is the boundary, and a refusal here writes nothing at all.
		const holding = await selectAssignmentsForUnits(writing.db, [
			...new Set(assignments.map((assignment) => assignment.unitId))
		]);

		contracts.forEach((contract, index) => {
			const row = rows[index];
			const status = contract.status ?? 'active';

			if (status !== 'terminated') {
				const taken = getConflictingAssignedUnitIds(holding, row, row.id);
				const named = held[index].find((assignment) => taken.has(assignment.unitId));

				if (named) {
					throw refuse('contract.unitsTakenNamed', { named: named.unit });
				}
			}

			holding.push(
				...held[index].map((assignment) => ({
					unitId: assignment.unitId,
					contractId: row.id,
					status,
					start: row.start,
					end: row.end,
					interval: row.interval,
					cost: row.cost
				}))
			);
		});

		const terminated = rows
			.filter((_, index) => contracts[index].status === 'terminated')
			.map((row) => row.id);

		return {
			statements: [
				...rows.map((row) => writing.db.insert(s.contract).values(row)),
				...assignments.map(({ contractId, unitId }) =>
					writing.db.insert(s.contractUnit).values({ contractId, unitId })
				)
			],
			// a termination lands once the payments have, at the end of the same batch.
			closing:
				terminated.length > 0
					? [
							writing.db
								.update(s.contract)
								.set({ status: 'terminated' })
								.where(inArray(s.contract.id, terminated))
						]
					: [],
			count: rows.length,
			touched: { contractIds: rows.map((row) => row.id) }
		};
	},
	// what the file could not carry: a contract's status, its paid and its expected amount are
	// what its term and its payments make them (a termination aside, which the pass leaves
	// standing), and a unit's status is what its contracts make it.
	// Recomputed here rather than trusted from a column anyone could have edited, and scoped to
	// what was written, which is what [[rules/data]], under *Reconcile scope*, asks of a mutation.
	//
	// The touch-set is every contract the write reached, not only the ones it created: a payment
	// resolves against a contract already here as readily as against one two statements above it,
	// and a file that only adds payments creates no contract at all. Scoped to the created rows
	// alone, a ledger read back into a contract would move its money and leave its paid amount and
	// its status saying otherwise. The units follow from the contracts, which the pass closes over
	// on its own.
	settle: (ctx, now, touched) =>
		reconcileTouched(ctx, now, {
			contractIds: [...(touched.contractIds ?? [])],
			unitIds: [...(touched.unitIds ?? [])]
		})
});
