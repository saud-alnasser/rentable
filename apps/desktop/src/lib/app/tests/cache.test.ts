import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

import complex, { unit } from '$lib/complex/feature.ts';
import contract from '$lib/contract/feature.ts';
import payment from '$lib/payment/feature.ts';
import tenant from '$lib/tenant/feature.ts';

/**
 * THE CACHE POLICY IS HANDED OVER, AND NOTHING READS IT EARLY
 *
 * Every module that keys by the workspace prefixes is loaded here before `$lib/app/cache` has
 * provided them. Loading them reads nothing; a key read before the policy is provided throws;
 * and once it is provided, each key starts with the prefix its feature declares.
 */

// the query modules reach `.svelte` files this harness cannot load. The substitutes answer
// nothing, which is all a module being loaded asks of them.
mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({}),
		createMutation: () => ({}),
		createQuery: () => ({})
	}
});

mock.module('svelte-sonner', {
	exports: { toast: { success: () => {}, error: () => {}, dismiss: () => {} } }
});

const { keys: tenantKeys } = await import('$lib/tenant/query');
const { keys: complexKeys } = await import('$lib/complex/query');
const { keys: contractKeys } = await import('$lib/contract/query');
const { keys: paymentKeys } = await import('$lib/payment/query');
const { keys: dashboardKeys } = await import('$lib/dashboard/query');
await import('$lib/history/query');
await import('$lib/workspace/query');
const { historyKeys } = await import('$lib/history');
const { sharedPrefix } = await import('$lib/mutation');

test('a key read before the policy is provided throws', () => {
	const early = /read before it was provided/;

	assert.throws(() => tenantKeys.all, early);
	assert.throws(() => complexKeys.units.all, early);
	assert.throws(() => contractKeys.get('c'), early);
	assert.throws(() => paymentKeys.get('p'), early);
	assert.throws(() => dashboardKeys.all, early);
	assert.throws(() => historyKeys.all(sharedPrefix()), early);
});

test("once provided, each key starts with its feature's declared prefix", async () => {
	await import('$lib/app/cache');

	assert.deepEqual(tenantKeys.all, tenant.prefix);
	assert.deepEqual(complexKeys.all, complex.prefix);
	assert.deepEqual(complexKeys.units.all, unit.prefix);
	assert.deepEqual(contractKeys.get('c'), [...contract.prefix, 'c']);
	assert.deepEqual(paymentKeys.get('p'), [...payment.prefix, 'one', 'p']);
	assert.deepEqual(dashboardKeys.all, [...contract.prefix, 'dashboard']);
	assert.deepEqual(historyKeys.all(sharedPrefix()), [...contract.prefix, 'history']);
});
