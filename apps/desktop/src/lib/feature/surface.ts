import type { RecordAct } from '$lib/act';
import type { RecordKind } from '$lib/permission';
import type { Component } from 'svelte';

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
	sections?: Section[];
	/** what it contributes to the settings area */
	settings?: SettingsSection[];
	/** what it contributes to the shell's own menus: the account menu, the workspace menu */
	slots?: ShellSlot[];
};

/** A place in navigation: the route it opens, and whether the rail and the trail show it. */
export type NavigationPlace = {
	route: string;
	/** its label, in the reader's language, wherever the shell names it */
	label: () => string;
	sidebar?: boolean;
	trail?: boolean;
};

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

/** A section drawn on a page another feature owns, placed by `order` among that page's others. */
export type Section = {
	on: RecordKind | 'settings';
	order: number;
	component: Component;
};

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
