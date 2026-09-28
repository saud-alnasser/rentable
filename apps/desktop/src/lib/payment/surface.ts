import { defineSurface } from '$lib/feature/surface';
import { historySection } from '$lib/history/ui';
import { memberPermissions } from '$lib/permission';
import host from './component/host.svelte';
import Ledger from './component/ledger.svelte';

export default defineSurface({
	name: 'payment',
	host,
	sections: [
		// a contract's payments lead its page: a contract exists to be paid. Drawn wherever the
		// reader may see payments at all.
		{
			on: 'contract',
			order: 10,
			value: 'payments',
			label: (t) => t.common.nav.payments(),
			shows: () => memberPermissions.views('payment'),
			component: Ledger
		},
		// the one collection a payment has: what was done to it, as a contract's page shows its own.
		historySection('payment', 10)
	]
});
