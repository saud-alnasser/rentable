import assert from 'node:assert/strict';
import test from 'node:test';

import { contributionsOf } from '../feature.ts';

// Ticket 62 of effort 840: a feature's reverse needs are contributions, merged by the composition
// root into one object per kind it serves.

test('what several declarations contribute to one kind is merged into one object', () => {
	const inForce = ['active'] as const;
	const occupying = ['active', 'defaulted'] as const;

	const merged = contributionsOf([
		{ name: 'plain' },
		{ contributes: { tenant: { inForce } } },
		{ contributes: { tenant: { counted: true }, unit: { occupying } } }
	]);

	assert.deepEqual(merged, { tenant: { inForce, counted: true }, unit: { occupying } });
	assert.equal(merged.tenant.inForce, inForce);
});

test('a member two declarations contribute is refused, rather than one silently winning', () => {
	assert.throws(
		() =>
			contributionsOf([
				{ contributes: { tenant: { inForce: 1 } } },
				{ contributes: { tenant: { inForce: 2 } } }
			]),
		/tenant\.inForce is contributed twice/
	);
});
