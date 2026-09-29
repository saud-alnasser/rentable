import { type Api, monthsFromNow, seedTenant } from '$lib/app/tests/testing.ts';

/**
 * THE CONTRACTS A ROUTER TEST STARTS FROM
 *
 * scaffolding the contract's router tests share, its own and each sub-concept's: what a contract is
 * created from and comes back as, and the complex, unit and contract a test seeds first, and the
 * contract a reminder is read for.
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
