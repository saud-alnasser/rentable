import type { Pathname } from '$app/types';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { withSection, type SettingsSectionAddress } from '$lib/settings/section';
import ContractIcon from '@lucide/svelte/icons/scroll-text';
import HouseIcon from '@lucide/svelte/icons/house';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import BuildingIcon from '@lucide/svelte/icons/building';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import UsersIcon from '@lucide/svelte/icons/users';
import UserIcon from '@lucide/svelte/icons/user';

type Icon = typeof UserIcon;

/** A place the shell can send the user, wherever the shell offers to do so. */
export type Destination = {
	/**
	 * The address this destination opens.
	 *
	 * **A section address is one of them**, since 2026-09-14: the settings area's four sections
	 * are four destinations on one pathname, told apart by `?section=`, so anything keying a
	 * list of these keys on the whole string rather than on the pathname.
	 *
	 * The two members are named rather than widened to `PathnameWithSearchOrHash`, and that is
	 * `resolve`'s doing: its argument type is a conditional over the route it is handed, which
	 * distributes into a union of tuples, and the wide type is assignable to none of them. A
	 * union of literal addresses is.
	 */
	url: Pathname | SettingsSectionAddress;
	/** The icon that stands for it, and the only thing shown when the sidebar is collapsed. */
	icon: Icon;
	/** Its name, read from the translations the caller holds. */
	label: (translations: TranslationFunctions) => string;
};

/**
 * The application's own places, in the order the shell presents them.
 *
 * No glyph here is the one the sidebar uses as the application's mark: the rail draws the mark
 * above these, so a destination wearing it would show one picture twice meaning two different
 * things — the brand, and somewhere to go.
 *
 * The dashboard's is the asymmetric-panel drawing rather than the even grid, which is already
 * spoken for: the complexes row uses the grid for a complex's unit total, where it reads as the
 * spaces themselves.
 */
export const primaryDestinations: Destination[] = [
	{ url: '/', icon: LayoutDashboardIcon, label: (t) => t.common.nav.dashboard() },
	{ url: '/tenants', icon: UserIcon, label: (t) => t.common.nav.tenants() },
	{ url: '/complexes', icon: HouseIcon, label: (t) => t.common.nav.complexes() },
	{ url: '/contracts', icon: ContractIcon, label: (t) => t.common.nav.contracts() }
];

/**
 * Places that configure the application rather than hold its records: the settings area's
 * sections, each at its own address.
 *
 * **The rail no longer draws these**, since 2026-08-20: its footer is the account control, and
 * settings is one row inside that control's menu. This list stays because the command palette
 * searches it, and a person who knows what they want to change is asking for the section rather
 * than for the page it is on.
 *
 * **Four rows on one pathname**, since 2026-09-14, where there were four pathnames before: the
 * three pages this replaced retired with requirement 14 of effort 826. `withSection` is what
 * writes each address, so the parameter's name is written once. *There were seven rows until
 * requirement 24 of effort 828 named the sections for what they hold; updates, diagnostics, the
 * you section and the sync section are each part of one of these four now, so a person searching
 * for one of those words is offered the row it is on rather than a row of its own.*
 *
 * The order is `settings/section.ts`'s, so the palette offers them in the order the rail draws
 * them. No glyph is repeated, and none is the gear the account menu wears for the area as a
 * whole: these rows name parts of it rather than the whole.
 */
export const secondaryDestinations: Destination[] = [
	{
		url: withSection('general'),
		icon: SlidersHorizontalIcon,
		label: (t) => t.settings.section.general()
	},
	{ url: withSection('account'), icon: CircleUserIcon, label: (t) => t.settings.section.account() },
	{
		url: withSection('organization'),
		icon: UsersIcon,
		label: (t) => t.settings.section.organization()
	},
	{
		url: withSection('workspaces'),
		icon: BuildingIcon,
		label: (t) => t.settings.section.workspaces()
	}
];
