import type { RouteId } from '$app/types';
import type { RecordKind } from '$lib/workspace/permission';

/**
 * Every page this application has, by its route id.
 *
 * `satisfies` holds each entry to a route SvelteKit generated, so a page renamed or removed stops
 * this compiling; `tests/navigation.test.ts` holds the list to the routes directory the other way
 * round, so a page added is one this list has to name.
 */
export const PAGE_ROUTES = [
	'/',
	'/tenants',
	'/tenants/[id]',
	'/complexes',
	'/complexes/[id]',
	'/complexes/units/[id]',
	'/contracts',
	'/contracts/[id]',
	'/contracts/units/[id]',
	'/contracts/payments/[id]',
	'/settings',
	'/organization/new',
	'/organization/join'
] as const satisfies readonly RouteId[];

export type PageRoute = (typeof PAGE_ROUTES)[number];

/**
 * The places the trail names, each a page a crumb can link to.
 *
 * **The dashboard is not one**: it is where the application opens, so a trail starting from it
 * would say the same first word on every screen. **Nor is the way in**: `/organization/new` and
 * `/organization/join` are a walk on a card that says which step it is on, and a trail above it
 * would name a place the reader is passing through rather than one they can return to.
 */
export const TRAIL_PLACES = [
	'/tenants',
	'/complexes',
	'/contracts',
	'/settings'
] as const satisfies readonly PageRoute[];

export type TrailPlace = (typeof TRAIL_PLACES)[number];

/**
 * The record page a record's page is reached through, where it has one.
 *
 * **A payment is reached through its contract**: it has no name of its own and no directory, and
 * its address sits under `/contracts` without a page at `/contracts/payments`. So its trail runs
 * through the contract it was made against, which is a page, rather than skipping from the
 * directory to an amount. **A unit is reached through its complex** the same way: its address sits
 * under `/complexes` without a page at `/complexes/units`, and it belongs to one complex. Each
 * crumb is named and addressed by the record's own surface, since the route id says which kind of
 * record the parent is and never which one.
 */
export const RECORD_PARENTS: Partial<Record<PageRoute, PageRoute>> = {
	'/complexes/units/[id]': '/complexes/[id]',
	'/contracts/payments/[id]': '/contracts/[id]'
};

/** One crumb of the trail. */
export type BreadcrumbCrumb =
	| {
			/** a place: a page the crumb links to, named by the caller in the reader's language. */
			kind: 'place';
			route: TrailPlace;
			/** Whether this is the deepest crumb, which reads as the current page. */
			isLast: boolean;
	  }
	| {
			/**
			 * the record the page's record is reached through, named and addressed by the page's
			 * record surface. Never the last crumb.
			 */
			kind: 'parent';
			route: PageRoute;
			isLast: false;
	  }
	| {
			/** the record the trail ends on, named by its record surface. Always the last crumb. */
			kind: 'record';
			route: PageRoute;
			isLast: true;
	  };

/**
 * The kind of record each place lists, where it lists one.
 *
 * **A place listing a kind the reader may not view is not offered at all** (effort 838,
 * requirement 10): its directory would only be refused, and a rail row that leads to a refusal
 * says the application has something for the reader that it does not. A unit is listed inside its
 * complex and a payment inside its contract, so they have no place of their own here.
 */
export const PLACE_KINDS = {
	'/tenants': 'tenant',
	'/complexes': 'complex',
	'/contracts': 'contract'
} as const satisfies Partial<Record<TrailPlace, RecordKind>>;

/**
 * The places of a list the reader may go to: every one but those listing a kind they may not view.
 * Anything that is not such a place, the dashboard and the settings sections among them, stays.
 */
export function toViewablePlaces<T extends { url: string }>(
	places: readonly T[],
	views: (kind: RecordKind) => boolean
): T[] {
	return places.filter((place) => {
		const kind = PLACE_KINDS[place.url as keyof typeof PLACE_KINDS];

		return !kind || views(kind);
	});
}

/**
 * Whether `route` is the section the current `pathname` sits in.
 *
 * The root is active only at the root: every path starts with `/`, so treating it as a
 * prefix would light the dashboard up everywhere.
 */
export function isActiveRoute(pathname: string, route: string): boolean {
	if (route === '/') {
		return pathname === '/';
	}

	return pathname === route || pathname.startsWith(`${route}/`);
}

const isPlace = (route: string): route is TrailPlace =>
	(TRAIL_PLACES as readonly string[]).includes(route);

const isPage = (route: string): route is PageRoute =>
	(PAGE_ROUTES as readonly string[]).includes(route);

/**
 * The trail of places the page at `routeId` sits under, outermost first, ending on the record
 * where the page is one.
 *
 * **Built from the route id, never from the address.** A path segment is not a place: the address
 * of a unit passes through `/complexes/units`, and no page lives there, so a trail read off the
 * address linked to three screens that did not exist. Here a prefix of the route id is a crumb only
 * where it is one of the trail's places, and the page's own last segment, where it is a record's
 * identifier, is the record the trail ends on, after the record it is reached through where it has
 * one (`RECORD_PARENTS`).
 *
 * `null` is SvelteKit's route id for an address no route matched, which has no trail.
 */
export function toBreadcrumbTrail(routeId: string | null): BreadcrumbCrumb[] {
	if (!routeId || !isPage(routeId)) {
		return [];
	}

	const segments = routeId.split('/').filter(Boolean);
	const crumbs: BreadcrumbCrumb[] = [];

	segments.forEach((segment, index) => {
		const prefix = `/${segments.slice(0, index + 1).join('/')}`;
		const isOwnSegment = index === segments.length - 1;

		if (isOwnSegment && segment.startsWith('[')) {
			const parent = RECORD_PARENTS[routeId];

			if (parent) {
				crumbs.push({ kind: 'parent', route: parent, isLast: false });
			}

			crumbs.push({ kind: 'record', route: routeId, isLast: true });

			return;
		}

		if (isPlace(prefix)) {
			crumbs.push({ kind: 'place', route: prefix, isLast: false });
		}
	});

	const last = crumbs.at(-1);

	if (last?.kind === 'place') {
		last.isLast = true;
	}

	return crumbs;
}
