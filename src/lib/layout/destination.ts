import type { Pathname } from '$app/types';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { Icon } from '@tabler/icons-svelte';
import ContractIcon from '@tabler/icons-svelte/icons/contract';
import Home2Icon from '@tabler/icons-svelte/icons/home-2';
import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
import SettingsIcon from '@tabler/icons-svelte/icons/settings';
import UserIcon from '@tabler/icons-svelte/icons/user';

/** A place the shell can send the user, wherever the shell offers to do so. */
export type Destination = {
	/** The route this destination opens. */
	url: Pathname;
	/** The icon that stands for it, and the only thing shown when the sidebar is collapsed. */
	icon: Icon;
	/** Its name, read from the translations the caller holds. */
	label: (translations: TranslationFunctions) => string;
};

/** The application's own places, in the order the shell presents them. */
export const primaryDestinations: Destination[] = [
	{ url: '/', icon: InnerShadowTopIcon, label: (t) => t.common.nav.dashboard() },
	{ url: '/tenants', icon: UserIcon, label: (t) => t.common.nav.tenants() },
	{ url: '/complexes', icon: Home2Icon, label: (t) => t.common.nav.complexes() },
	{ url: '/contracts', icon: ContractIcon, label: (t) => t.common.nav.contracts() }
];

/** Places that configure the application rather than hold its records. */
export const secondaryDestinations: Destination[] = [
	{ url: '/settings', icon: SettingsIcon, label: (t) => t.common.nav.settings() }
];
