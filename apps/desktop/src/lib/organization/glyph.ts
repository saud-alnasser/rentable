import CoinsIcon from '@lucide/svelte/icons/coins';
import HouseIcon from '@lucide/svelte/icons/house';
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
import UserIcon from '@lucide/svelte/icons/user';
import UsersIcon from '@lucide/svelte/icons/users';

import type { RecordKind } from '$lib/organization/role';

/**
 * The glyph each kind of record is drawn with wherever a role's permissions are shown: the switch
 * list's groups and a role's card (effort 838, requirement 12 as amended 2026-09-27). The house,
 * the unit grid of the complexes row, the person, the scroll and the coins are the ones each kind
 * already has ([[rules/frontend]]: a concept keeps one glyph everywhere it appears), and the
 * organization's people stand for the administration.
 */
export const KIND_GLYPH = {
	complex: HouseIcon,
	unit: LayoutGridIcon,
	tenant: UserIcon,
	contract: ScrollTextIcon,
	payment: CoinsIcon
} as const satisfies Record<RecordKind, typeof HouseIcon>;

/** the administration's glyph: the organization's people. */
export const ADMINISTRATION_GLYPH = UsersIcon;
