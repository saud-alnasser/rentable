import { defineFeature } from '$lib/feature/feature';
import router from './router';

// a payment has no name of its own and no directory: it is listed inside its contract, and its
// address sits under `/contracts` without a page at `/contracts/payments`, so its trail runs
// through the contract it was made against rather than skipping from the directory to an amount.
export default defineFeature({
	name: 'payment',
	router,
	pages: [{ route: '/contracts/payments/[id]', parent: '/contracts/[id]' }]
});
