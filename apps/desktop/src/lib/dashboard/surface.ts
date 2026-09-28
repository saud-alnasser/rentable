import { defineSurface } from '$lib/feature/surface';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';

/**
 * The dashboard's place, first on the rail.
 *
 * Its glyph is the asymmetric-panel drawing rather than the even grid, which is already spoken
 * for: the complexes row uses the grid for a complex's unit total, where it reads as the spaces
 * themselves.
 */
export default defineSurface({
	name: 'dashboard',
	places: [
		{ route: '/', label: (t) => t.common.nav.dashboard(), icon: LayoutDashboardIcon, rail: true }
	]
});
