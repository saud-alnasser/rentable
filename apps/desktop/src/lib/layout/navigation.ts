import type { RouteId } from '$app/types';
import { features } from '$lib/app/features';
import type { Page } from '$lib/feature/feature';
import type { PlaceAddress } from '$lib/feature/surface';
import type { RecordKind } from '$lib/permission';

/**
 * Every page a feature declares, in the list's order and each feature's own.
 *
 * **The shell names no page.** Which pages exist, which the trail names, what each lists and what
 * a record page is reached through are each feature's `pages`, in its `feature.ts`, which loads
 * under Node where this is tested. What a page is called and the icon it wears are the window's,
 * and its feature's surface declares them.
 */
const pages: readonly Page[] = features.flatMap((feature) => feature.pages ?? []);

/**
 * Every page this application has, by its route id.
 *
 * `Page` holds each to a route SvelteKit generated, so a page renamed or removed stops the feature
 * declaring it compiling; `tests/navigation.test.ts` holds the list to the routes directory the
 * other way round, so a page added is one some feature has to declare.
 */
export const PAGE_ROUTES: readonly RouteId[] = pages.map((page) => page.route);

/**
 * The places the trail names, each a page a crumb can link to.
 *
 * **Not every page with no identifier in it is one.** The page the application opens on would put
 * the same first word on every screen, and a walk the reader is passing through is not a place to
 * return to, so a feature says which of its pages the trail names (`Page.trail`).
 */
export const TRAIL_PLACES: readonly PlaceAddress[] = pages
	.filter((page) => page.trail)
	.map((page) => page.route)
	.filter(isAddress);

/**
 * The record page a record's page is reached through, where it has one.
 *
 * A record listed inside another record, with no directory of its own, has an address under its
 * parent's directory and no page at the segment between, so its trail runs through the record it
 * belongs to rather than skipping from the directory to it (`Page.parent`). Each crumb is named and
 * addressed by the record's own surface, since the route id says which kind of record the parent
 * is and never which one.
 */
export const RECORD_PARENTS: Partial<Record<RouteId, RouteId>> = Object.fromEntries(
	pages.flatMap((page) => (page.parent ? [[page.route, page.parent]] : []))
);

/** Whether `route` has no identifier in it, which makes it an address as it stands. */
function isAddress(route: RouteId): route is PlaceAddress {
	return !route.includes('[');
}

/** One crumb of the trail. */
export type BreadcrumbCrumb =
	| {
			/** a place: a page the crumb links to, named by the caller in the reader's language. */
			kind: 'place';
			route: PlaceAddress;
			/** Whether this is the deepest crumb, which reads as the current page. */
			isLast: boolean;
	  }
	| {
			/**
			 * the record the page's record is reached through, named and addressed by the page's
			 * record surface. Never the last crumb.
			 */
			kind: 'parent';
			route: RouteId;
			isLast: false;
	  }
	| {
			/** the record the trail ends on, named by its record surface. Always the last crumb. */
			kind: 'record';
			route: RouteId;
			isLast: true;
	  };

/**
 * The kind of record each place lists, where it lists one (`Page.lists`).
 *
 * **A place listing a kind the reader may not view is not offered at all** (effort 838,
 * requirement 10): its directory would only be refused, and a rail row that leads to a refusal
 * says the application has something for the reader that it does not. A kind listed inside its
 * parent's record has no place of its own here.
 */
export const PLACE_KINDS: Partial<Record<RouteId, RecordKind>> = Object.fromEntries(
	pages.flatMap((page) => (page.lists ? [[page.route, page.lists]] : []))
);

/**
 * The places of a list the reader may go to: every one but those listing a kind they may not view.
 * Anything that is not such a place, the root and every section of a page among them, stays.
 */
export function toViewablePlaces<T extends { url: string }>(
	places: readonly T[],
	views: (kind: RecordKind) => boolean
): T[] {
	return places.filter((place) => {
		const kind = PLACE_KINDS[place.url as RouteId];

		return !kind || views(kind);
	});
}

/**
 * Whether `route` is the section the current `pathname` sits in.
 *
 * The root is active only at the root: every path starts with `/`, so treating it as a
 * prefix would light the root's row up everywhere.
 */
export function isActiveRoute(pathname: string, route: string): boolean {
	if (route === '/') {
		return pathname === '/';
	}

	return pathname === route || pathname.startsWith(`${route}/`);
}

const isPlace = (route: string): route is PlaceAddress =>
	(TRAIL_PLACES as readonly string[]).includes(route);

const isPage = (route: string): route is RouteId =>
	(PAGE_ROUTES as readonly string[]).includes(route);

/**
 * The trail of places the page at `routeId` sits under, outermost first, ending on the record
 * where the page is one.
 *
 * **Built from the route id, never from the address.** A path segment is not a place: the address
 * of a record reached through another passes through a segment no page lives at, so a trail read
 * off the address linked to screens that did not exist. Here a prefix of the route id is a crumb
 * only where it is one of the trail's places, and the page's own last segment, where it is a
 * record's identifier, is the record the trail ends on, after the record it is reached through
 * where it has one (`RECORD_PARENTS`).
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
