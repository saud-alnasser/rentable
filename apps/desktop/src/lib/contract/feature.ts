import { defineFeature } from '$lib/feature/feature';
import { CONTRACT_IN_FORCE_STATUSES, CONTRACT_OCCUPYING_STATUSES } from './contract';
import { unitStatuses } from './reconcile';
import router from './router';
import contracts from './transfer';

export default defineFeature({
	name: 'contract',
	router,
	kind: 'contract',
	prefix: ['contracts'],
	transfer: [contracts],
	pages: [
		{ route: '/contracts', trail: true, lists: 'contract' },
		{ route: '/contracts/[id]' },
		{ route: '/contracts/units/[id]' }
	],
	// the contract depends on the tenant and the unit, so what their procedures read of the
	// contracts naming them arrives from here rather than by their importing it.
	contributes: {
		tenant: { inForceStatuses: CONTRACT_IN_FORCE_STATUSES },
		unit: { occupyingStatuses: CONTRACT_OCCUPYING_STATUSES, unitStatuses }
	}
});
