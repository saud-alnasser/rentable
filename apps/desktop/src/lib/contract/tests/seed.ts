import {
	type Api,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId
} from '$lib/app/tests/testing.ts';
import { getContractRenewalTerm } from '$lib/contract/renewal/renewal.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import * as s from '$lib/platform/database/schema.ts';
import { eq } from 'drizzle-orm';

/**
 * THE CONTRACTS A ROUTER TEST STARTS FROM
 *
 * scaffolding the contract's router tests share, its own and each sub-concept's: what a contract is
 * created from and comes back as, and the complex, unit and contract a test seeds first, and the
 * contract a reminder is read for, and a renewed contract up for renewal but for its renewal.
 */

/** what a contract is created from, and what one comes back as, as the caller states them. */
export type ContractInput = Parameters<Api['contract']['create']>[0];
export type CreatedContract = Awaited<ReturnType<Api['contract']['create']>>;

export async function seedComplexWithUnit(api: Api, label: string) {
	const complex = await api.complex.create({ name: `Complex ${label}`, location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: `Unit ${label}`, complexId: complex.id });

	return { complex, unit };
}

export async function seedContract(api: Api, overrides: Partial<ContractInput> = {}) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		...overrides
	});
}

// a unit named out of alphabetical order with its sibling, so the units are read in name order
// rather than in the order they were assigned.
export async function seedRemindedContract(
	api: Api,
	fields: Omit<ContractInput, 'tenantId' | 'unitIds'>
) {
	const tenant = await seedTenant(api);
	const { complex, unit: second } = await seedComplexWithUnit(api, 'Remind-B');
	const first = await api.complex.units.create({ name: 'Unit Remind-A', complexId: complex.id });
	const contract = await api.contract.create({
		...fields,
		tenantId: tenant.id,
		unitIds: [second.id, first.id]
	});

	return { tenant, contract };
}

/**
 * A caller over a database of its own, holding a contract paid in full and ending inside the
 * notice window, which ranks it as ending soon, and the renewal of it (effort 861, requirement 7).
 * The renewal has not started, so it is scheduled and in no rank of its own.
 */
export async function seedRenewedEndingSoon() {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const contract = await seedContract(api, {
		govId: 'RENEWED',
		cost: 100,
		start: monthsFromNow(-11),
		end: monthsFromNow(1)
	});

	await api.payment.create({ contractId: contract.id, amount: 100, date: monthsFromNow(-2) });

	const term = getContractRenewalTerm(contract);
	const successor = await api.contract.renew({
		contractId: contract.id,
		govId: 'RENEWAL',
		start: term.start.getTime(),
		end: term.end.getTime(),
		cost: contract.cost
	});

	return { db, api, contract, successor };
}

/** The three ways a renewal stops standing, after each of which its predecessor is up again. */
export const RENEWAL_WITHDRAWALS = ['deleted', 'terminated', 'retired'] as const;

/**
 * Take a renewal down one of {@link RENEWAL_WITHDRAWALS}: deleted, terminated, or retired into a
 * copy by a merge (`platform/database/retired`), which only the pass after a pull does and so is
 * written into the row here as `renewal/tests/router.test.ts` writes it.
 *
 * Terminated is written into the row as well. The renewal has not started, and a contract that has
 * not started is not terminated by hand (`canManuallyTerminateContractStatus`); what is read here
 * is the status, however it came to be, and `terminated` is the one no reconcile overrides.
 */
export async function withdrawRenewal(
	{ db, api }: Awaited<ReturnType<typeof seedRenewedEndingSoon>>,
	successorId: string,
	how: (typeof RENEWAL_WITHDRAWALS)[number]
) {
	if (how === 'deleted') {
		await api.contract.delete({ id: successorId });
	} else if (how === 'terminated') {
		await db.update(s.contract).set({ status: 'terminated' }).where(eq(s.contract.id, successorId));
	} else {
		await db
			.update(s.contract)
			.set({ mergedInto: unusedId() })
			.where(eq(s.contract.id, successorId));
	}
}
