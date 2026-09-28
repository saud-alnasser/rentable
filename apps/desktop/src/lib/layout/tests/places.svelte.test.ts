import { expect, test } from 'vitest';

import { places, surfaces } from '$lib/app/surfaces';
import { primaryDestinations, secondaryDestinations } from '$lib/layout/destination';
import { PAGE_ROUTES, TRAIL_PLACES } from '$lib/layout/navigation';

/**
 * THE PLACES THE SURFACES DECLARE, AS THE SHELL READS THEM
 *
 * Ticket 28 of effort 840: the rail, the command menu's places and the trail's names are read from
 * each surface's `places`, in `app/surfaces.ts`'s own order for them. A surface module draws, so
 * this runs here rather than beside `navigation.test.ts`, which reads the pages under Node.
 */

test('every surface declaring places is in the order the shell offers them', () => {
	const declared = surfaces.flatMap((surface) => surface.places ?? []);

	expect(new Set(places)).toEqual(new Set(declared));
	expect(places).toHaveLength(declared.length);
});

test('every place is on a page a feature declares', () => {
	for (const place of places) {
		expect(PAGE_ROUTES).toContain(place.route);
	}
});

test('every place the trail names has a name', () => {
	for (const route of TRAIL_PLACES) {
		expect(places.some((place) => place.route === route && !place.url)).toBe(true);
	}
});

test('the rail and the command menu offer the places they offered, in the same order', () => {
	expect(primaryDestinations.map((destination) => destination.url)).toEqual([
		'/',
		'/tenants',
		'/complexes',
		'/contracts'
	]);
	expect(secondaryDestinations.map((destination) => destination.url)).toEqual([
		'/settings?section=general',
		'/settings?section=account',
		'/settings?section=organization',
		'/settings?section=workspaces'
	]);
});
