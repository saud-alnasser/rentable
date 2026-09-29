import { defineSurface } from '$lib/feature/surface';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import { keys } from './query';

/**
 * The dashboard's place, first on the rail, and what it hands the settings area: its ranks read the
 * ending-soon figure the area sets, so a change there refreshes the screen.
 *
 * Its glyph is the asymmetric-panel drawing rather than the even grid, which is already spoken
 * for: the complexes row uses the grid for a complex's unit total, where it reads as the spaces
 * themselves.
 */
export default defineSurface({
	name: 'dashboard',
	places: [
		{ route: '/', label: (t) => t.common.nav.dashboard(), icon: LayoutDashboardIcon, rail: true }
	],
	contributes: {
		settings: { endingSoonReaders: () => keys.all }
	}
});
