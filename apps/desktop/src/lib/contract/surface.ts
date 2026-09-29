import { resolve } from '$app/paths';
import { toPaletteActs } from '$lib/act';
import { withCreateIntent } from '$lib/create';
import { defineSurface } from '$lib/feature/surface';
import ContractIcon from '@lucide/svelte/icons/scroll-text';
import { historySection } from '$lib/history/ui';
import { memberPermissions } from '$lib/permission';
import host from './component/host.svelte';
import { contractActs, contractHost } from './host.svelte';
import TenantContracts from './component/tenant-contracts.svelte';
import UnitContracts from './component/unit-contracts.svelte';
import { CONTRACT_ATTENTION_ORDER } from './contract';
import { useListContracts, useSearchContracts } from './query';

// a record's contracts, drawn on its own page wherever the reader may see contracts at all.
const shows = () => memberPermissions.views('contract');

export default defineSurface({
	name: 'contract',
	places: [
		{ route: '/contracts', label: (t) => t.common.nav.contracts(), icon: ContractIcon, rail: true }
	],
	// a contract stands on its own, so it is made in its directory, where it will be listed.
	create: {
		subject: 'contract',
		label: (t) => t.common.labels.contract(),
		flags: ['createContract'],
		kind: 'directory',
		directory: '/contracts',
		href: resolve(withCreateIntent('/contracts'))
	},
	search: [
		{
			subject: 'contract',
			kind: 'contract',
			heading: (t) => t.common.nav.contracts(),
			href: (match) => resolve(`/contracts/${match.id}`),
			find: (term, _asked, { limit }) => useSearchContracts(term, limit)
		}
	],
	acts: [
		{
			subject: 'contract',
			kind: 'contract',
			use: () => ({
				offered: (t, isAppleKeyboard) => toPaletteActs(contractActs, t, isAppleKeyboard),
				runOn: (actId, contractId) => contractHost.runOn(actId, contractId)
			})
		}
	],
	host,
	sections: [
		{
			on: 'tenant',
			order: 10,
			value: 'contracts',
			label: (t) => t.common.nav.contracts(),
			shows,
			component: TenantContracts
		},
		{
			on: 'unit',
			order: 10,
			value: 'contracts',
			label: (t) => t.common.nav.contracts(),
			shows,
			component: UnitContracts
		},
		// last on the contract's own page, after its payments, its schedule and its units.
		historySection('contract', 40)
	],
	// the contract depends on the tenant, the complex and the unit, so what their pages, hosts and
	// acts read of the contracts on them arrives from here rather than by their importing it.
	contributes: {
		tenant: {
			attentionOrder: CONTRACT_ATTENTION_ORDER,
			viewsContracts: shows,
			useHeldContracts: (tenantId, enabled) =>
				useListContracts(
					() => '',
					() => null,
					() => ({ tenantId: tenantId() }),
					enabled
				),
			newContract: (tenantId) => contractHost.create({ tenantId })
		},
		unit: {
			useHeldContracts: (unitId, enabled) =>
				useListContracts(
					() => '',
					() => null,
					() => ({ unitId: unitId() }),
					enabled
				),
			newContract: (unitId) => contractHost.create({ unitIds: [unitId] }),
			viewsTenants: () => memberPermissions.views('tenant')
		},
		complex: {
			// narrowed to the complex in the procedure: loading every contract to keep one building's
			// would be the client-side narrowing ADR 0010 refuses.
			useActiveContractCount: (complexId) => {
				const complexContracts = useListContracts(
					() => '',
					() => null,
					() => ({ complexId: complexId() })
				);

				return {
					get count() {
						return complexContracts.data?.filter((contract) => contract.status === 'active').length;
					}
				};
			}
		}
	}
});
