import { defineFeature } from '$lib/feature/feature';
import { paymentsOf } from './payment';
import router from './router';
import payments from './transfer';

// a payment has no name of its own and no directory: it is listed inside its contract, and its
// address sits under `/contracts` without a page at `/contracts/payments`, so its trail runs
// through the contract it was made against rather than skipping from the directory to an amount.
export default defineFeature({
	name: 'payment',
	router,
	kind: 'payment',
	prefix: ['contracts', 'payments'],
	transfer: [payments],
	pages: [{ route: '/contracts/payments/[id]', parent: '/contracts/[id]' }],
	// the payment depends on the contract, so the payments a contract's settlement reads arrive
	// from here rather than by its importing them.
	contributes: { contract: { paymentsOf } }
});
