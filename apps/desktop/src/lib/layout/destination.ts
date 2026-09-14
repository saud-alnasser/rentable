import type { Pathname } from '$app/types';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { withSection, type SettingsSectionAddress } from '$lib/settings/section';
import type { Icon } from '@tabler/icons-svelte';
import ContractIcon from '@tabler/icons-svelte/icons/contract';
import Home2Icon from '@tabler/icons-svelte/icons/home-2';
import LayoutDashboardIcon from '@tabler/icons-svelte/icons/layout-dashboard';
import AdjustmentsIcon from '@tabler/icons-svelte/icons/adjustments';
import BuildingIcon from '@tabler/icons-svelte/icons/building';
import DownloadIcon from '@tabler/icons-svelte/icons/download';
import RefreshIcon from '@tabler/icons-svelte/icons/refresh';
import StethoscopeIcon from '@tabler/icons-svelte/icons/stethoscope';
import UserCircleIcon from '@tabler/icons-svelte/icons/user-circle';
import UsersGroupIcon from '@tabler/icons-svelte/icons/users-group';
import UserIcon from '@tabler/icons-svelte/icons/user';

/** A place the shell can send the user, wherever the shell offers to do so. */
export type Destination = {
	/**
	 * The address this destination opens.
	 *
	 * **A section address is one of them**, since 2026-09-14: the settings area's seven sections
	 * are seven destinations on one pathname, told apart by `?section=`, so anything keying a
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
	{ url: '/complexes', icon: Home2Icon, label: (t) => t.common.nav.complexes() },
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
 * **Seven rows on one pathname**, since 2026-09-14, where there were four pathnames before: the
 * three pages this replaced retired with requirement 14 of effort 826. `withSection` is what
 * writes each address, so the parameter's name is written once.
 *
 * The order is `settings/section.ts`'s, which is requirement 14's, so the palette offers them in
 * the order the rail draws them. No glyph is repeated, and none is the gear the account menu
 * wears for the area as a whole: these rows name parts of it rather than the whole.
 */
export const secondaryDestinations: Destination[] = [
	{
		url: withSection('general'),
		icon: AdjustmentsIcon,
		label: (t) => t.settings.section.general()
	},
	{ url: withSection('you'), icon: UserCircleIcon, label: (t) => t.settings.section.you() },
	{ url: withSection('members'), icon: UsersGroupIcon, label: (t) => t.settings.section.members() },
	{
		url: withSection('workspaces'),
		icon: BuildingIcon,
		label: (t) => t.settings.section.workspaces()
	},
	{ url: withSection('sync'), icon: RefreshIcon, label: (t) => t.settings.section.sync() },
	{ url: withSection('updates'), icon: DownloadIcon, label: (t) => t.settings.section.updates() },
	{
		url: withSection('diagnostics'),
		icon: StethoscopeIcon,
		label: (t) => t.settings.section.diagnostics()
	}
];
