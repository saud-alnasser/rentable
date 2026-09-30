import assert from 'node:assert/strict';
import test from 'node:test';

import api from '$lib/api/caller.ts';

/**
 * THE CALLER IS BOUND BY THE COMPOSITION ROOT
 *
 * `$lib/api/caller` knows the root router only by its type, and `$lib/app/caller` binds it in as
 * the root layout loads. A procedure reached before that has nothing to run, and says why rather
 * than failing somewhere inside tRPC.
 */
test('a procedure reached before the root router is bound throws, naming the cause', () => {
	assert.throws(() => api.tenant, /called before the root router was bound/);
});

test('once bound, the caller holds every root procedure', async () => {
	await import('$lib/app/caller.ts');

	assert.equal(typeof api.tenant.getMany, 'function');
});
