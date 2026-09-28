import type { Pathname, RouteId } from '$app/types';
import type { RecordAct } from '$lib/act';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordKind } from '$lib/permission';
import type HouseIcon from '@lucide/svelte/icons/house';
import type { Component } from 'svelte';

type Icon = typeof HouseIcon;

/**
 * THE SURFACE CONTRACT
 *
 * what a feature, or a capability with something on screen, hands the shell in its own
 * `surface.ts`, and what the shell reads off the list of them in `$lib/app/surfaces`. Where
 * `feature.ts` is what the root router mounts and loads under Node, this is what the window draws,
 * so it may import a component, and nothing but `app/surfaces.ts` imports it.
 *
 * **The shell names no feature.** Every list it draws, the hosts it mounts, the places it links,
 * the command menu's groups and the sections a page renders, is read from the surfaces in the
 * list's order, so adding a feature to the window is a line in `app/surfaces.ts`.
 */
export type Surface = {
	/** the feature or capability it is, by the name its `feature.ts` declares where it has one */
	name: string;
	/** where it sits in navigation: the sidebar, the trail, the breadcrumb's label, the route */
	places?: NavigationPlace[];
	/** its entry in the command menu's create group */
	create?: CreateEntry;
	/** its group of records in the command menu's search */
	search?: SearchEntry;
	/** what may be done to one of its records, in its own order */
	acts?: readonly RecordAct<never>[];
	/** mounted once by the frame, above whatever route is drawn */
	host?: Component;
	/** what it contributes to a page another feature draws */
	sections?: AnySection[];
	/** what it contributes to the settings area */
	settings?: SettingsSection[];
	/** what it contributes to the shell's own menus: the account menu, the workspace menu */
	slots?: ShellSlot[];
};

/**
 * A place in navigation as the window shows it: what it is called, and where the shell offers to
 * go there. Which pages exist and how the trail and the reader's permissions treat them are the
 * feature's `pages`, in its `feature.ts`, since navigation reads them under Node; this names and
 * draws one of those pages.
 */
export type NavigationPlace = {
	/** the page it is on, as a feature's `pages` declares it */
	route: PlaceAddress;
	/** its name, in the reader's language, wherever the shell names it: the trail, the rail, the menu */
	label: (translations: TranslationFunctions) => string;
	/**
	 * the icon that stands for it, which makes it a destination: the command menu offers it, and
	 * the rail too where `rail` says so. A place without one is only named, in the trail.
	 */
	icon?: Icon;
	/** the address it opens, where that is more than its route: a section of the page */
	url?: `${PlaceAddress}?${string}`;
	/** whether the rail draws it, beside the command menu offering it */
	rail?: boolean;
};

/**
 * The address of a page with no identifier in it, which is what a place is: its route is an
 * address as it stands.
 *
 * **Kept to the pages there are**, rather than widened to any address, because `resolve` reads the
 * route out of the type it is handed: its argument type is a conditional over the route, which
 * distributes into a union of tuples, and a wide type is assignable to none of them. A union of
 * these few literal addresses, and of them carrying a search, is.
 */
export type PlaceAddress = Extract<Pathname, RouteId>;

/** One entry of the command menu's create group. */
export type CreateEntry = {
	kind: RecordKind;
	/** its name, in the reader's language */
	label: () => string;
	create: () => void;
};

/** One group of the command menu's search: the records of one kind that match what is typed. */
export type SearchEntry = {
	kind: RecordKind;
	/** the group's heading, in the reader's language */
	heading: () => string;
};

/** The pages a section can be drawn on: a record's, by its kind, or the settings area. */
export type SectionTarget = RecordKind | 'settings';

/**
 * What the page hands a section it draws. A record's page hands it the record: its kind, which is
 * the `on` it was contributed to, and its id.
 */
export type SectionProps<On extends SectionTarget = SectionTarget> = On extends RecordKind
	? { kind: On; recordId: string }
	: Record<string, never>;

/**
 * A section drawn on a page another feature owns, placed by `order` among that page's others.
 *
 * On a record's page it is one of the record's collections: `value` names it in the address, and
 * the reader chooses it by `label`. One the reader may not see, where `shows` says so, is left
 * out whole rather than drawn empty.
 */
export type Section<On extends SectionTarget = SectionTarget> = {
	on: On;
	order: number;
	value: string;
	label: (t: TranslationFunctions) => string;
	shows?: () => boolean;
	component: Component<SectionProps<On>>;
};

/** A section for any page: what a surface declares, and what the list of surfaces holds. */
export type AnySection = { [On in SectionTarget]: Section<On> }[SectionTarget];

/** A section of the settings area, placed by `order` among the others. */
export type SettingsSection = {
	order: number;
	component: Component;
};

/** Something drawn inside one of the shell's own menus. */
export type ShellSlot = {
	slot: 'account-menu' | 'workspace-menu';
	component: Component;
};

/** Declare a surface. */
export const defineSurface = (surface: Surface) => surface;
