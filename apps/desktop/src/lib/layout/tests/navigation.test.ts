import assert from 'node:assert/strict';
import test from 'node:test';

import { isActiveRoute, toBreadcrumbTrail } from '../navigation.ts';

test('a route is active on its own page and on anything beneath it', () => {
	assert.equal(isActiveRoute('/tenants', '/tenants'), true);
	assert.equal(isActiveRoute('/tenants/42', '/tenants'), true);
	assert.equal(isActiveRoute('/complexes', '/tenants'), false);
});

test('a route is not active for a sibling whose name it prefixes', () => {
	assert.equal(isActiveRoute('/tenants-archive', '/tenants'), false);
});

test('the dashboard is active only at the root, never beneath it', () => {
	assert.equal(isActiveRoute('/', '/'), true);
	assert.equal(isActiveRoute('/tenants', '/'), false);
});

test('the trail names every static segment, deepest last', () => {
	assert.deepEqual(toBreadcrumbTrail('/complexes/units'), [
		{ segment: 'complexes', path: '/complexes', isLast: false },
		{ segment: 'units', path: '/complexes/units', isLast: true }
	]);
});

test('the root has no trail to show', () => {
	assert.deepEqual(toBreadcrumbTrail('/'), []);
});

test('a record identifier is not a place, so it leaves the trail', () => {
	assert.deepEqual(toBreadcrumbTrail('/tenants/42'), [
		{ segment: 'tenants', path: '/tenants', isLast: true }
	]);

	assert.deepEqual(toBreadcrumbTrail('/contracts/1f0d9f4c-3b1e-4a0a-9b6e-2c6a5f7d8e90/payments'), [
		{ segment: 'contracts', path: '/contracts', isLast: false },
		{
			segment: 'payments',
			path: '/contracts/1f0d9f4c-3b1e-4a0a-9b6e-2c6a5f7d8e90/payments',
			isLast: true
		}
	]);
});

test('the last static segment is the last crumb even when an identifier follows it', () => {
	assert.deepEqual(toBreadcrumbTrail('/complexes/units/7'), [
		{ segment: 'complexes', path: '/complexes', isLast: false },
		{ segment: 'units', path: '/complexes/units', isLast: true }
	]);
});
