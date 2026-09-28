import { defineSurface } from '$lib/feature/surface';
import ContractIcon from '@lucide/svelte/icons/scroll-text';
import { historySection } from '$lib/history/ui';
import { memberPermissions } from '$lib/permission';
import host from './component/host.svelte';
import TenantContracts from './component/tenant-contracts.svelte';
import UnitContracts from './component/unit-contracts.svelte';

// a record's contracts, drawn on its own page wherever the reader may see contracts at all.
const shows = () => memberPermissions.views('contract');

export default defineSurface({
	name: 'contract',
	places: [
		{ route: '/contracts', label: (t) => t.common.nav.contracts(), icon: ContractIcon, rail: true }
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
	]
});
