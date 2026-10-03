import { defineSurface } from '$lib/feature/surface';
import { prefixOf } from '$lib/mutation';
import CalendarCogIcon from '@lucide/svelte/icons/calendar-cog';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import { ENDING_SOON_PARAM } from './dashboard';
import { keys } from './query';

/**
 * The dashboard's place, first on the rail, and what it hands the settings area: what reads the
 * ending-soon figure the dashboard's section sets, so a change there refreshes every reading of
 * the rank.
 *
 * Its glyph is the asymmetric-panel drawing rather than the even grid, which is already spoken
 * for: the complexes row uses the grid for a complex's unit total, where it reads as the spaces
 * themselves.
 *
 * **The ending-soon window is a place of its own in the command menu** (effort 846, requirement
 * 6): it is set from the dashboard's ending-soon section, and a reader who looked for it in the
 * settings types its name and lands on the control, open. The rail does not draw it.
 */
export default defineSurface({
	name: 'dashboard',
	places: [
		{ route: '/', label: (t) => t.common.nav.dashboard(), icon: LayoutDashboardIcon, rail: true },
		{
			route: '/',
			url: `/?${ENDING_SOON_PARAM}`,
			label: (t) => t.dashboard.endingSoon.title(),
			icon: CalendarCogIcon
		}
	],
	contributes: {
		settings: {
			// the landing screen's, whichever period it shows, and the contract's: its list
			// filtered by rank, a contract's page and its schedule all read the rank, and a
			// record's reads sit directly under the kind's prefix, so the prefix is the narrowest
			// key covering them. The dashboard's key sits under it too, by the cache policy's
			// choice rather than the dashboard's, so it is named here all the same.
			endingSoonReaders: () => [keys.all, prefixOf('contract')]
		}
	}
});
