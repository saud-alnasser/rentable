import type { RouteId } from '$app/types';

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
			/** the record the trail ends on, named by its record surface. Always the last crumb. */
			kind: 'record';
			route: PageRoute;
			isLast: true;
	  };

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
 * identifier, is the record the trail ends on.
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
