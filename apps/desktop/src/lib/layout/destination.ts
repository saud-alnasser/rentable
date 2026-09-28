import { places } from '$lib/app/surfaces';
import type { NavigationPlace, PlaceAddress } from '$lib/feature/surface';

/** A place the shell can send the user, wherever the shell offers to do so. */
export type Destination = {
	/**
	 * The address this destination opens.
	 *
	 * **A section address is one of them**, since 2026-09-14: several destinations can stand on
	 * one pathname, told apart by their search, so anything keying a list of these keys on the
	 * whole string rather than on the pathname.
	 */
	url: PlaceAddress | NonNullable<NavigationPlace['url']>;
	/** The icon that stands for it, and the only thing shown when the sidebar is collapsed. */
	icon: NonNullable<NavigationPlace['icon']>;
	/** Its name, read from the translations the caller holds. */
	label: NavigationPlace['label'];
};

/**
 * Every place a surface offers to go to, with the rail's own beside it, in `app/surfaces.ts`'s
 * order. A place with no icon is only named, in the trail, and is no destination; one with no
 * address of its own opens its route.
 */
const destinations = places.flatMap(({ route, url, icon, label, rail }) =>
	icon ? [{ destination: { url: url ?? route, icon, label }, rail }] : []
);

/** The application's own places, in the order the shell presents them: the rail's rows. */
export const primaryDestinations: Destination[] = destinations
	.filter(({ rail }) => rail)
	.map(({ destination }) => destination);

/**
 * Places that configure the application rather than hold its records, which the command menu
 * offers after the rail's and the rail does not draw.
 */
export const secondaryDestinations: Destination[] = destinations
	.filter(({ rail }) => !rail)
	.map(({ destination }) => destination);
