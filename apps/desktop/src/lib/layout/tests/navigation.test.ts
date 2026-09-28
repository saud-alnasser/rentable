import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFiles } from '#tests/source.ts';

import {
	isActiveRoute,
	PAGE_ROUTES,
	PLACE_KINDS,
	toBreadcrumbTrail,
	toViewablePlaces,
	type BreadcrumbCrumb
} from '../navigation.ts';
import type { RecordKind } from '$lib/workspace/permission.ts';

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

/** every route id with a page, read off the routes directory rather than off the list. */
function routesOnDisk(): string[] {
	return sourceFiles(/^\+page\.svelte$/)
		.map(({ label }) => label.split('/'))
		.filter((segments) => segments[0] === 'routes')
		.map((segments) => `/${segments.slice(1, -1).join('/')}`)
		.sort();
}

test('the list of pages is every page in the routes directory, and nothing else', () => {
	assert.deepEqual([...PAGE_ROUTES].sort(), routesOnDisk());
});

// criterion 14(a) of effort 832: no crumb links to a non-route. Asked of every page the
// application has, against the routes directory itself.
test('every crumb on every page is a route', () => {
	const pages = new Set(routesOnDisk());

	for (const route of PAGE_ROUTES) {
		for (const crumb of toBreadcrumbTrail(route)) {
			assert.ok(pages.has(crumb.route), `${route} has a crumb to ${crumb.route}`);
		}
	}
});

test('the three addresses no page lives at are never a crumb', () => {
	const crumbs = PAGE_ROUTES.flatMap((route) => toBreadcrumbTrail(route));

	for (const missing of ['/complexes/units', '/contracts/units', '/contracts/payments']) {
		assert.equal(
			crumbs.some((crumb) => crumb.route === missing),
			false,
			missing
		);
	}
});

test('a record page ends on the record, under the directory it belongs to', () => {
	const expected: Record<string, BreadcrumbCrumb[]> = {
		'/tenants/[id]': [
			{ kind: 'place', route: '/tenants', isLast: false },
			{ kind: 'record', route: '/tenants/[id]', isLast: true }
		],
		'/complexes/[id]': [
			{ kind: 'place', route: '/complexes', isLast: false },
			{ kind: 'record', route: '/complexes/[id]', isLast: true }
		],
		// a unit is reached through its complex, and its trail runs through it (ticket 36).
		'/complexes/units/[id]': [
			{ kind: 'place', route: '/complexes', isLast: false },
			{ kind: 'parent', route: '/complexes/[id]', isLast: false },
			{ kind: 'record', route: '/complexes/units/[id]', isLast: true }
		],
		'/contracts/[id]': [
			{ kind: 'place', route: '/contracts', isLast: false },
			{ kind: 'record', route: '/contracts/[id]', isLast: true }
		],
		'/contracts/units/[id]': [
			{ kind: 'place', route: '/contracts', isLast: false },
			{ kind: 'record', route: '/contracts/units/[id]', isLast: true }
		],
		// a payment is reached through its contract, and its trail runs through it (ticket 33).
		'/contracts/payments/[id]': [
			{ kind: 'place', route: '/contracts', isLast: false },
			{ kind: 'parent', route: '/contracts/[id]', isLast: false },
			{ kind: 'record', route: '/contracts/payments/[id]', isLast: true }
		]
	};

	for (const [route, trail] of Object.entries(expected)) {
		assert.deepEqual(toBreadcrumbTrail(route), trail, route);
	}
});

test('a directory and the settings area are the one crumb, and it is the current page', () => {
	for (const route of ['/tenants', '/complexes', '/contracts', '/settings'] as const) {
		assert.deepEqual(toBreadcrumbTrail(route), [{ kind: 'place', route, isLast: true }]);
	}
});

test('the dashboard and the way in have no trail to show', () => {
	for (const route of ['/', '/organization/new', '/organization/join']) {
		assert.deepEqual(toBreadcrumbTrail(route), [], route);
	}
});

test('an address no route matched has no trail', () => {
	assert.deepEqual(toBreadcrumbTrail(null), []);
	assert.deepEqual(toBreadcrumbTrail('/nowhere'), []);
});

/*
 * Effort 838, requirement 10 and criterion 10: a place listing a kind the reader may not view is
 * left out of the rail and the command menu, which both read their places through this.
 */

/** the rail's places and the settings sections, by address alone, in the order they are drawn. */
const PLACES = [
	{ url: '/' },
	{ url: '/tenants' },
	{ url: '/complexes' },
	{ url: '/contracts' },
	{ url: '/settings?section=general' }
];

const viewingAllBut =
	(...hidden: RecordKind[]) =>
	(kind: RecordKind) =>
		!hidden.includes(kind);

test('without a kind the reader may view, its place is left out and every other place stays', () => {
	for (const [url, kind] of Object.entries(PLACE_KINDS)) {
		assert.deepEqual(
			toViewablePlaces(PLACES, viewingAllBut(kind)).map((place) => place.url),
			PLACES.map((place) => place.url).filter((kept) => kept !== url),
			`without viewing ${kind}`
		);
	}
});

test('a reader who may view everything is offered every place', () => {
	assert.deepEqual(
		toViewablePlaces(PLACES, () => true),
		PLACES
	);
});

test('the dashboard and the settings stay for a reader who may view nothing', () => {
	assert.deepEqual(
		toViewablePlaces(PLACES, () => false).map((place) => place.url),
		['/', '/settings?section=general']
	);
});

test('units and payments have no place of their own: they are reached through their parent', () => {
	assert.deepEqual(Object.values(PLACE_KINDS).sort(), ['complex', 'contract', 'tenant']);
	assert.deepEqual(
		toViewablePlaces(PLACES, viewingAllBut('unit', 'payment')).map((place) => place.url),
		PLACES.map((place) => place.url)
	);
});
