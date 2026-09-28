import complex, { unit } from '$lib/complex/surface';
import contract from '$lib/contract/surface';
import dashboard from '$lib/dashboard/surface';
import type { AnySection, NavigationPlace, Section, SectionTarget } from '$lib/feature/surface';
import organization from '$lib/organization/surface';
import { createPalette } from '$lib/palette';
import payment from '$lib/payment/surface';
import settings from '$lib/settings/surface';
import tenant from '$lib/tenant/surface';
import workspace from '$lib/workspace/surface';

/**
 * THE SURFACES
 *
 * every feature's surface, which is what the shell reads to draw the window: the frame mounts each
 * one's `host`, and a page draws the `sections` they contribute to it. This is the one place that names them all, as `features.ts` is for the routers.
 *
 * **The order is load-bearing.** The frame mounts the hosts in this order, and a host may depend
 * on what mounted before it: the workspace's permissions come first, so every host below draws
 * off what the reader may do, and the rest keep the order they had when the frame named each one.
 * Adding a surface appends it unless it has a reason to stand earlier.
 */
export const surfaces = [
	workspace,
	tenant,
	complex,
	unit,
	contract,
	payment,
	organization,
	dashboard,
	settings
] as const;

/**
 * The command menu, built from what every surface declares for it: the kinds it searches, the
 * create group and the acts, each in this list's order. The menu opens on tenants, complexes,
 * units, contracts and payments, then a member and a workspace, which is the order the surfaces
 * declaring them stand in above.
 */
export const palette = createPalette(surfaces);

/**
 * Every place the shell names or offers, in the order it offers them: the rail's rows from the top,
 * then the command menu's, each surface's places in its own order.
 *
 * **Its own list, because the two orders differ.** Hosts mount the workspace's permissions first;
 * the rail opens on the dashboard, where the application opens, and runs down the three
 * directories, and the command menu ends on the settings sections. A surface declaring places is
 * listed here as well as above, and `layout/tests/places.svelte.test.ts` holds it to that.
 *
 * No glyph among these is the one the rail uses as the application's mark: the rail draws the mark
 * above its rows, so a place wearing it would show one picture twice meaning two different things,
 * the brand and somewhere to go.
 */
export const places: readonly NavigationPlace[] = [
	dashboard,
	tenant,
	complex,
	contract,
	settings
].flatMap((surface) => surface.places ?? []);

/**
 * The sections every surface contributes to one page, in their `order` there, and in the list's
 * order where two share one. A page is handed these by its route, since a feature imports nothing
 * from here, and draws them as its own.
 */
export function sectionsOn<On extends SectionTarget>(on: On): Section<On>[] {
	return surfaces
		.flatMap((surface): readonly AnySection[] => surface.sections ?? [])
		.filter((section): section is Section<On> & AnySection => section.on === on)
		.sort((a, b) => a.order - b.order);
}
