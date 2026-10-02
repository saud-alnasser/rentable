import type { Icon } from '$lib/feature/surface';
import BuildingIcon from '@lucide/svelte/icons/building';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import UsersIcon from '@lucide/svelte/icons/users';
import type { SettingsSection } from './section';

/**
 * The glyph each of the settings area's four sections is drawn with.
 *
 * **One map, read by both places a section is named with a picture**: the command menu's rows
 * (`surface.ts`) and the area's section switch (`component/area.svelte`), so the two cannot
 * disagree about which glyph stands for which section.
 *
 * **It is the window's alone.** `section.ts` names the sections and loads under Node, where a
 * component cannot be imported, so the pictures live here beside it rather than in it.
 *
 * No glyph is repeated, and none is the gear the account menu wears for the area as a whole:
 * these name parts of it rather than the whole.
 */
export const SECTION_GLYPH = {
	general: SlidersHorizontalIcon,
	account: CircleUserIcon,
	organization: UsersIcon,
	workspaces: BuildingIcon
} as const satisfies Record<SettingsSection, Icon>;
