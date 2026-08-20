import * as s from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { reconcileTouched } from '$lib/contract/reconcile';
import { newId } from '$lib/platform/database/identity';
import {
	toContractReference,
	toGovIdFromReference,
	toIsoDay,
	toTransferKey,
	toUnitParts,
	toUnitReference,
	type WorkspaceHeld,
	type WorkspaceTransfer
} from '$lib/workspace/workspace';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import z from 'zod';

/**
 * WORKSPACE
 *
 * the whole workspace as one thing: read out of the database in the shape a file holds it, and
 * written back from that shape in a single batch.
 *
 * **Nothing here decides what a file means.** Which columns it has, which of its rows are
 * records and whether a reference resolves are all answered in `$lib/workspace/workspace`
 * before this is called — a batch is built before any of it runs and cannot branch on its own
 * results ([[rules/data]], under *Multi-table writes*), so the resolution could not happen here
 * even if it belonged here.
 *
 * What this does own is the one thing the planning pass cannot know: the identities. A record
 * names another by a name, and the row it becomes names it by an id.
 */

const TransferTenantSchema = z.object({
	name: z.string(),
	nationalId: z.string(),
	phone: z.string()
});

const TransferComplexSchema = z.object({ name: z.string(), location: z.string() });

const TransferUnitSchema = z.object({ complex: z.string(), name: z.string() });

const TransferContractSchema = z.object({
	reference: z.string(),
	tenant: z.string(),
	units: z.array(z.string()),
	start: z.number(),
	end: z.number(),
	interval: z.enum(['1m', '3m', '6m', '12m']),
	cost: z.number()
});

const TransferPaymentSchema = z.object({
	contract: z.string(),
	date: z.number(),
	amount: z.number()
});

// what a file may ask to be written, and nothing else. A status, a paid amount and an expected
// amount are absent on purpose: they are derived from a contract's term and its payments, and a
// file that could assert them could put a workspace into a state its own rows contradict.
const WorkspaceTransferSchema = z.object({
	tenants: z.array(TransferTenantSchema),
	complexes: z.array(TransferComplexSchema),
	units: z.array(TransferUnitSchema),
	contracts: z.array(TransferContractSchema),
	payments: z.array(TransferPaymentSchema)
});

/**
 * The id a name stands for, or a refusal naming what could not be found.
 *
 * **What a name is keyed under is not always the name.** A tenant, a complex and a contract are
 * each one value, and a unit is two — the complex holding it and its own name — which is how the
 * planning pass keys one and therefore how this has to. `values` is that key; `name` stays what a
 * person wrote, because it is what the refusal has to say back to them.
 */
function resolve(
	ids: Map<string, string>,
	name: string,
	what: string,
	values: readonly string[] = [name]
) {
	const id = ids.get(toTransferKey(...values));

	if (id === undefined) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `no ${what} called '${name.trim()}'` });
	}

	return id;
}

export default router({
	/**
	 * The whole workspace, in the shape a file holds it.
	 *
	 * Every record names what it points at by a name rather than by an id, and it is composed
	 * here rather than in the surface that writes the file: the reference a payment carries has
	 * to be the same string the contracts sheet carries, and two places composing it separately
	 * is two places for them to drift apart.
	 */
	get: procedure.member.query(async ({ ctx }): Promise<WorkspaceTransfer> => {
		const tenants = await ctx.db
			.select()
			.from(s.tenant)
			.orderBy(asc(s.tenant.name), asc(s.tenant.id));
		const complexes = await ctx.db
			.select()
			.from(s.complex)
			.orderBy(asc(s.complex.name), asc(s.complex.id));
		const units = await ctx.db
			.select({ name: s.unit.name, status: s.unit.status, complex: s.complex.name })
			.from(s.unit)
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
			.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id));
		const contracts = await ctx.db
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
		const assignments = await ctx.db
			.select({ contractId: s.contractUnit.contractId, unit: s.unit.name, complex: s.complex.name })
			.from(s.contractUnit)
			.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
			.orderBy(asc(s.complex.name), asc(s.unit.name));
		const payments = await ctx.db
			.select({ date: s.payment.date, amount: s.payment.amount, contractId: s.payment.contractId })
			.from(s.payment)
			.orderBy(asc(s.payment.date), asc(s.payment.id));

		const unitsOf = new Map<string, string[]>();

		for (const assignment of assignments) {
			const held = unitsOf.get(assignment.contractId) ?? [];

			held.push(toUnitReference(assignment.complex, assignment.unit));
			unitsOf.set(assignment.contractId, held);
		}

		const referenceOf = new Map(
			contracts.map((contract) => [contract.id, toContractReference(contract)])
		);

		return {
			tenants: tenants.map((tenant) => ({
				name: tenant.name,
				nationalId: tenant.nationalId,
				phone: tenant.phone
			})),
			complexes: complexes.map((complex) => ({
				name: complex.name,
				location: complex.location
			})),
			units: units.map((unit) => ({
				complex: unit.complex,
				name: unit.name,
				status: unit.status
			})),
			contracts: contracts.map((contract) => ({
				reference: referenceOf.get(contract.id) ?? '',
				tenant: contract.tenant,
				units: unitsOf.get(contract.id) ?? [],
				start: contract.start.getTime(),
				end: contract.end.getTime(),
				interval: contract.interval,
				cost: contract.cost,
				status: contract.status,
				paidAmount: contract.paidAmount,
				expectedAmount: contract.expectedAmount
			})),
			// a payment whose contract is somehow missing is left out rather than written under an
			// empty reference: the import refuses a whole file over a reference nothing answers to,
			// and a workspace that could not be handed over because of a row nothing points at is
			// the worse failure.
			payments: payments.flatMap((payment) => {
				const contract = referenceOf.get(payment.contractId);

				return contract ? [{ contract, date: payment.date.getTime(), amount: payment.amount }] : [];
			})
		};
	}),

	/**
	 * What the workspace already holds, by the names a file uses.
	 *
	 * Read as values rather than as rows, and in one call rather than one per concept: a file of
	 * a thousand records checked one at a time would be a thousand round trips before any of it
	 * is written, which is the cost the tenant import already reckoned with.
	 */
	held: procedure.member.query(async ({ ctx }): Promise<WorkspaceHeld> => {
		const tenants = await ctx.db
			.select({ nationalId: s.tenant.nationalId, phone: s.tenant.phone })
			.from(s.tenant);
		const complexes = await ctx.db.select({ name: s.complex.name }).from(s.complex);
		const units = await ctx.db
			.select({ name: s.unit.name, complex: s.complex.name })
			.from(s.unit)
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id));
		const contracts = await ctx.db
			.select({
				id: s.contract.id,
				govId: s.contract.govId,
				start: s.contract.start,
				tenant: s.tenant.nationalId
			})
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));
		const payments = await ctx.db
			.select({ date: s.payment.date, amount: s.payment.amount, contractId: s.payment.contractId })
			.from(s.payment);

		const referenceOf = new Map(
			contracts.map((contract) => [contract.id, toContractReference(contract)])
		);

		return {
			tenants: tenants.map((tenant) => [tenant.nationalId, tenant.phone]),
			complexes: complexes.map((complex) => complex.name),
			units: units.map((unit) => [unit.complex, unit.name]),
			contracts: [...referenceOf.values()],
			// spelled as a file spells them, because that is what a row is compared against: the
			// day rather than the instant, and the figure rather than a rendering of it.
			payments: payments.map((payment) => [
				referenceOf.get(payment.contractId) ?? '',
				toIsoDay(payment.date),
				String(payment.amount)
			])
		};
	}),

	/**
	 * Write a whole workspace, in one batch.
	 *
	 * **Every identity is decided before the batch is built.** A batch cannot branch on its own
	 * results, so a unit cannot ask for the id of the complex inserted two statements above it —
	 * the ids are minted here, one per row, which is what every other creation path does too.
	 * This used to read the highest id in use per concept and count up from it; that is five
	 * queries and a contiguous-block allocation that a client-minted identity removes.
	 *
	 * The statements run in the order the schema allows: a complex before the units in it, a
	 * tenant before the contracts naming them, a contract before its assignments and its
	 * payments. The boundary runs a batch inside a transaction, so a refusal anywhere leaves the
	 * workspace exactly as it was — nothing half-written, and no order in which it could be.
	 *
	 * References are resolved again here rather than trusted: the plan was made against the
	 * workspace as it was when the file was opened, and a record it named may have been deleted
	 * by hand in between.
	 */
	importWhole: procedure.member
		.use(autosync())
		.input(WorkspaceTransferSchema)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			// what a name resolves to, whether the record is already here or is about to be. The
			// two are indistinguishable to the row that names it, which is the whole point of a
			// file that references by name.
			const heldTenants = await ctx.db
				.select({ id: s.tenant.id, nationalId: s.tenant.nationalId })
				.from(s.tenant);
			const heldComplexes = await ctx.db
				.select({ id: s.complex.id, name: s.complex.name })
				.from(s.complex);
			const heldUnits = await ctx.db
				.select({ id: s.unit.id, name: s.unit.name, complex: s.complex.name })
				.from(s.unit)
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id));
			const heldContracts = await ctx.db
				.select({
					id: s.contract.id,
					govId: s.contract.govId,
					start: s.contract.start,
					tenant: s.tenant.nationalId
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

			const tenantIds = new Map(
				heldTenants.map((tenant) => [toTransferKey(tenant.nationalId), tenant.id])
			);
			const complexIds = new Map(
				heldComplexes.map((complex) => [toTransferKey(complex.name), complex.id])
			);
			const unitIds = new Map(
				heldUnits.map((unit) => [toTransferKey(unit.complex, unit.name), unit.id])
			);
			const contractIds = new Map(
				heldContracts.map((contract) => [toTransferKey(toContractReference(contract)), contract.id])
			);

			const tenantRows = input.tenants.map((tenant) => {
				const id = newId();

				tenantIds.set(toTransferKey(tenant.nationalId), id);

				return { id, name: tenant.name, nationalId: tenant.nationalId, phone: tenant.phone };
			});

			const complexRows = input.complexes.map((complex) => {
				const id = newId();

				complexIds.set(toTransferKey(complex.name), id);

				return { id, name: complex.name, location: complex.location };
			});

			const unitRows = input.units.map((unit) => {
				const id = newId();

				unitIds.set(toTransferKey(unit.complex, unit.name), id);

				return {
					id,
					name: unit.name,
					// a unit stands vacant until a contract says otherwise, and reconciliation is what
					// says otherwise. The file's own status column is not read, for the same reason a
					// contract's is not: it is derived.
					status: 'vacant' as const,
					complexId: resolve(complexIds, unit.complex, 'complex')
				};
			});

			const contractRows = input.contracts.map((contract) => {
				const id = newId();

				contractIds.set(toTransferKey(contract.reference), id);

				return {
					id,
					// a reference that is not the fallback shape is the government number itself,
					// which is what a person calls a contract.
					govId: toGovIdFromReference(contract.reference) ?? null,
					status: 'active' as const,
					start: new Date(contract.start),
					end: new Date(contract.end),
					interval: contract.interval,
					cost: contract.cost,
					paidAmount: 0,
					expectedAmount: 0,
					tenantId: resolve(tenantIds, contract.tenant, 'tenant')
				};
			});

			const assignmentRows = input.contracts.flatMap((contract) =>
				contract.units.map((unit) => ({
					contractId: resolve(contractIds, contract.reference, 'contract'),
					// split back into the pair the map is keyed under, by the planning pass's own
					// splitter rather than a second one: a composed reference asked for as one value
					// could never match a two-value key, and every assignment refused the whole
					// import (#562).
					unitId: resolve(unitIds, unit, 'unit', toUnitParts(unit))
				}))
			);

			const paymentRows = input.payments.map((payment) => ({
				id: newId(),
				date: new Date(payment.date),
				amount: payment.amount,
				contractId: resolve(contractIds, payment.contract, 'contract')
			}));

			const statements = [
				...tenantRows.map((row) => ctx.db.insert(s.tenant).values(row)),
				...complexRows.map((row) => ctx.db.insert(s.complex).values(row)),
				...unitRows.map((row) => ctx.db.insert(s.unit).values(row)),
				...contractRows.map((row) => ctx.db.insert(s.contract).values(row)),
				...assignmentRows.map((row) => ctx.db.insert(s.contractUnit).values(row)),
				...paymentRows.map((row) => ctx.db.insert(s.payment).values(row))
			];

			if (statements.length === 0) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'there is nothing to import' });
			}

			// the batch's type asks for at least one statement, and the guard above is what
			// establishes it.
			const [first, ...rest] = statements;

			await ctx.db.batch([first, ...rest]);

			// what the file could not carry: a contract's status, its paid and its expected amount
			// are what its term and its payments make them, and a unit's status is what its
			// contracts make it. Recomputed here rather than trusted from a column anyone could
			// have edited, and scoped to what was written — which is what [[rules/data]], under
			// *Reconcile scope*, asks of a mutation.
			//
			// The touch-set is every contract this write reached, not only the ones it created: a
			// payment resolves against a contract already here as readily as against one two
			// statements above it, and a file that only adds payments creates no contract at all.
			// Scoped to the created rows alone, a ledger read back into a contract would move its
			// money and leave its paid amount and its status saying otherwise. The units follow
			// from the contracts, which the pass closes over on its own.
			await reconcileTouched(ctx.db, now, {
				contractIds: [
					...contractRows.map((row) => row.id),
					...paymentRows.map((row) => row.contractId)
				],
				unitIds: unitRows.map((row) => row.id)
			});

			return {
				tenants: tenantRows.length,
				complexes: complexRows.length,
				units: unitRows.length,
				contracts: contractRows.length,
				payments: paymentRows.length
			};
		})
});
