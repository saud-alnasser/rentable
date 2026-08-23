import { regex } from '@rentable/design/identifier.js';

/** One static path segment of the current location, and the route that reaches it. */
export type BreadcrumbCrumb = {
	/** The raw path segment — the caller translates it for display. */
	segment: string;
	/** The absolute path this crumb links to, identifiers included. */
	path: string;
	/** Whether this is the deepest crumb, which reads as the current page. */
	isLast: boolean;
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

/**
 * The trail of places the current `pathname` passes through, outermost first.
 *
 * Record identifiers are dropped: a number or a UUID names a record rather than a place,
 * and the detail page it belongs to is already named by the segment before it. Their paths
 * still carry the identifier, so a crumb below one still resolves.
 */
export function toBreadcrumbTrail(pathname: string): BreadcrumbCrumb[] {
	const segments = pathname.split('/').filter(Boolean);
	const crumbs: Omit<BreadcrumbCrumb, 'isLast'>[] = [];
	let path = '';

	for (const segment of segments) {
		path += `/${segment}`;

		if (isIdentifier(segment)) {
			continue;
		}

		crumbs.push({ segment, path });
	}

	return crumbs.map((crumb, index) => ({ ...crumb, isLast: index === crumbs.length - 1 }));
}

function isIdentifier(segment: string) {
	return regex.identifier.numeric.test(segment) || regex.identifier.uuid.test(segment);
}
