import complex, { unit } from '$lib/complex/surface';
import contract from '$lib/contract/surface';
import dashboard from '$lib/dashboard/surface';
import { contributionsOf } from '$lib/feature/feature';
import {
	glyphsOf,
	provideContributions,
	provideGlyphs,
	type AnySection,
	type Icon,
	type NavigationPlace,
	type Section,
	type SectionTarget,
	type ShellSlot,
	type ShellSlotName,
	type ShellSlotProps,
	type Surface
} from '$lib/feature/surface';
import organization from '$lib/organization/surface';
import { createPalette } from '$lib/palette';
import payment from '$lib/payment/surface';
import settings from '$lib/settings/surface';
import tenant from '$lib/tenant/surface';
import workspace from '$lib/workspace/surface';
import type { RecordKind } from '$lib/permission';
import type { Component } from 'svelte';
import type { SurfaceContributions } from './contributions';

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
const declared = [
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
 * The list as the shell reads it, each one a surface: every field it may declare, whether or not
 * this one does.
 */
export const surfaces: readonly Surface[] = declared;

/**
 * **What the surfaces contribute to the kinds they depend on is provided here, once**, as this
 * module is first evaluated: the frame and every route import it, so it is in place before any
 * page, host or act reads it (`contributionsTo` in `$lib/feature/surface`). Merged from the list
 * as declared, so a member of `SurfaceContributions` nobody contributes fails the type check here.
 */
const contributions: SurfaceContributions = contributionsOf(declared);

provideContributions(contributions);

/**
 * **And the glyph each kind of record is drawn with**, from the surface of the feature holding it
 * (`record` in `$lib/feature/surface`): the role editor draws every kind, and may import none of
 * them. A kind no surface declares a glyph for fails the type check here.
 */
const glyphs: Record<RecordKind, Icon> = glyphsOf(declared);

provideGlyphs(glyphs);

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
 * listed here as well as above, and `shell/tests/places.svelte.test.ts` holds it to that.
 *
 * No glyph among these is the one the rail uses as the application's mark: the rail draws the mark
 * above its rows, so a place wearing it would show one picture twice meaning two different things,
 * the brand and somewhere to go.
 */
export const places: readonly NavigationPlace[] = (
	[dashboard, tenant, complex, contract, settings] as readonly Surface[]
).flatMap((surface) => surface.places ?? []);

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

/**
 * What every surface contributes to one of the shell's own places, in the list's order. The shell
 * draws each where the place is, handing it the place's props, so it names no feature.
 */
export function slotsAt<S extends ShellSlotName>(slot: S): Component<ShellSlotProps[S]>[] {
	return surfaces
		.flatMap((surface): readonly ShellSlot[] => surface.slots ?? [])
		.filter((entry) => entry.slot === slot)
		.map((entry) => entry.component as Component<ShellSlotProps[S]>);
}
