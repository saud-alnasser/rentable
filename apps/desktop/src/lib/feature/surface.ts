import type { Pathname, ResolvedPathname, RouteId } from '$app/types';
import type { SurfaceContributions } from '$lib/app/contributions';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordFlag, RecordKind } from '@rentable/workspace-permission';
import type { RecordMatch } from '$lib/platform/database/search';
import type { RecordCardAction } from '@rentable/design/block/record-card.svelte';
import type HouseIcon from '@lucide/svelte/icons/house';
import type { Component } from 'svelte';

/** A glyph, as the design package's icon set draws one. */
export type Icon = typeof HouseIcon;

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
	/** the kind of record it holds, on a feature that holds one, and how the window draws it */
	record?: RecordDeclaration;
	/** where it sits in navigation: the sidebar, the trail, the breadcrumb's label, the route */
	places?: NavigationPlace[];
	/** its entry in the command menu's create group */
	create?: CreateEntry;
	/** its groups of records in the command menu's search, one per kind of record it finds */
	search?: SearchEntry[];
	/** what the command menu offers to do to the records it finds, one per kind, in its own order */
	acts?: ActEntry[];
	/** mounted once by the frame, above whatever route is drawn */
	host?: Component;
	/** what it contributes to a page another feature draws: a record's, or the settings area */
	sections?: AnySection[];
	/** what it contributes to the shell's own places: the account menu, the workspace menu, dialogs */
	slots?: ShellSlot[];
	/**
	 * what it contributes to the kinds it depends on in the window, keyed by the kind each serves:
	 * what a page, a host or an act of a feature it depends on reads of it. See
	 * {@link contributionsTo}.
	 */
	contributes?: SurfaceContributing;
};

/**
 * A kind of record as the window draws it, declared by the feature holding it: the glyph that
 * stands for the kind itself, wherever the window shows the kind rather than a place, as the
 * groups of a role's permissions do. A kind keeps one glyph everywhere it appears
 * ([[rules/frontend]]), so where it has a place on the rail this is that place's icon.
 */
export type RecordDeclaration = {
	kind: RecordKind;
	glyph: Icon;
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

/**
 * One entry of the command menu's create group: a kind of record a person can create, and how the
 * menu reaches its host's `create`. Which way is the kind's own shape:
 *
 * - **a record that stands on its own** is made in its directory, which the menu links to with
 *   `?create`, so the record is made where it will be listed. The host consumes the intent there
 *   and opens its form.
 * - **a record that cannot be without another** asks for that record first, through the command
 *   menu's asking mode, the way a record's act asks for the record it runs on. The host is then
 *   asked with it.
 *
 * **It names the flags it needs**, every one of them (effort 838, requirement 10): the create its
 * procedure names, and, for an entry that asks for a record first, viewing the kind it asks for,
 * since a reader who cannot see a complex cannot choose the one a unit goes in. The menu offers it
 * only to a reader holding every one.
 */
export type CreateEntry = {
	/** what is created, by the subject its search entry names it with */
	subject: string;
	/** its name, in the reader's language */
	label: (translations: TranslationFunctions) => string;
	/** what the reader needs, every one of them, for the command menu to offer it */
	flags: readonly RecordFlag[];
} & (
	| {
			kind: 'directory';
			/** the directory it is created in, which its host answers `?create` on */
			directory: PlaceAddress;
			/**
			 * that directory's address with the intent on it, resolved where it is declared and
			 * literally: `resolve` reads the route out of the type it is handed.
			 */
			href: ResolvedPathname;
	  }
	| {
			kind: 'asks';
			/** the record a new one cannot be without, by its search entry's subject */
			asks: string;
			/** ask the host, with the record the reader chose */
			create: (recordId: string) => void;
	  }
);

/**
 * One record the palette found.
 *
 * `unavailable` is where the concept already knows, while the reader is choosing, that the act
 * waiting for a record cannot run on this one now: the row is shown and refused with the reason,
 * as a shortcut's is. A member's and a workspace's acts are the ones that know it. Declared here,
 * beside the search that answers with it, and re-exported by `$lib/palette`.
 */
export type PaletteMatch = RecordMatch & { unavailable?: string };

/** What a concept's search answers the palette with, found in SQL or in memory. */
export type RecordSearch = { readonly data: PaletteMatch[] | undefined };

/**
 * One group of the command menu's search: the records of one kind that match what is typed, what
 * the group is called, and where opening one goes.
 */
export type SearchEntry = {
	/**
	 * what an act or a create asking for one of these records names it, which is its record kind
	 * where it has one
	 */
	subject: string;
	/**
	 * its record kind, where it is one. A kind the reader may not view is not searched, and none
	 * of its acts is offered (effort 838, requirement 10).
	 */
	kind?: RecordKind;
	/** the group's heading, in the reader's language */
	heading: (translations: TranslationFunctions) => string;
	/** the record's own page, which is what opening a match reaches (ADR 0025) */
	href: (match: RecordMatch) => ResolvedPathname;
	/**
	 * the kind's own search, bound to the term the menu is holding and to the act waiting for a
	 * record, where one is; a search that answers whatever act is waiting ignores the second. A
	 * hook: the menu calls it once, as it mounts, with how many records it offers before the reader
	 * narrows further and whether it is showing.
	 */
	find: (
		term: () => string,
		asked: () => string | null,
		reading: { limit: number; isOpen: () => boolean }
	) => RecordSearch;
};

/**
 * One act as the command menu offers it. Declared here, beside the entry that offers it, and
 * re-exported by `$lib/act`, which projects a record's acts onto it.
 */
export type PaletteAct = {
	id: string;
	label: string;
	icon: RecordCardAction['icon'];
	tone: 'neutral' | 'error';
	/** the keys that also run it, as the keyboard prints them. Empty where none reach it. */
	hints: string[];
};

/**
 * What the command menu offers to do to the records of one kind its search finds, grouped under
 * that search entry's heading.
 */
export type ActEntry = {
	/** the search entry whose records these run on, by its subject */
	subject: string;
	/** its record kind, where it is one: nothing is offered where the reader may not view it */
	kind?: RecordKind;
	/**
	 * every act, in the kind's own order, and how one is run on the record the reader then chooses:
	 * the kind's host reads that record and answers on its terms. A hook, which the menu calls once
	 * as it mounts, since what some acts are gated on is read from queries while it is showing.
	 */
	use: (isOpen: () => boolean) => {
		offered: (translations: TranslationFunctions, isAppleKeyboard: boolean) => PaletteAct[];
		runOn: (actId: string, recordId: string) => void;
	};
};

/** The pages a section can be drawn on: a record's, by its kind, or the settings area. */
export type SectionTarget = RecordKind | 'settings';

/**
 * What the page hands a section it draws. A record's page hands it the record: its kind, which is
 * the `on` it was contributed to, and its id. The settings area hands it the one thing only the
 * shell can do for it, {@link SettingsSectionProps}.
 */
export type SectionProps<On extends SectionTarget = SectionTarget> = On extends RecordKind
	? { kind: On; recordId: string }
	: SettingsSectionProps;

/**
 * What the settings area hands a section it draws. A section there reads what it shows for
 * itself, as a record's section reads its records; what it cannot reach is the shell.
 */
export type SettingsSectionProps = {
	/**
	 * this machine let go of what it stood in, by an act the section ran: the area leaves for
	 * wherever signing out leaves, and the shell reads where the machine stands again. It resolves
	 * once both have been asked for.
	 */
	leaveForTheWall: () => Promise<void>;
};

/**
 * A section drawn on a page another feature owns, placed by `order` among that page's others.
 *
 * On a record's page it is one of the record's collections, and in the settings area one of its
 * sections: `value` names it in the address, and the reader chooses it by `label`. One the reader
 * may not see, where `shows` says so, is left out whole rather than drawn empty.
 */
export type Section<On extends SectionTarget = SectionTarget> = {
	on: On;
	order: number;
	value: string;
	label: (t: TranslationFunctions) => string;
	shows?: () => boolean;
	component: Component<SectionProps<On>>;
	/** what the section reads, started as the page is set up: {@link SectionLoad}. */
	load?: SectionLoad<On>;
};

/**
 * What a section starts reading before it is drawn, where the page asks for it. The settings page
 * calls every contribution's during its own setup, beside its settings query and whichever section
 * is shown, so what a section reads is asked for as the page mounts and switching to it draws data
 * rather than a load. It runs during component setup, so it may call query hooks. A record's page
 * asks for none.
 */
export type SectionLoad<On extends SectionTarget = SectionTarget> = On extends RecordKind
	? never
	: () => void;

/** A section for any page: what a surface declares, and what the list of surfaces holds. */
export type AnySection = { [On in SectionTarget]: Section<On> }[SectionTarget];

/**
 * The places the shell draws what a feature contributes to it, and what the shell hands the
 * component drawn at each. The shell owns the frame: which state it is in and what a switch or the
 * way in runs, so those arrive as props; what the component shows, it reads for itself.
 *
 * - **`workspace-menu`** is the top of the rail, the row naming the workspace that is open.
 * - **`account-menu`** is the foot of the rail, the row naming who is signed in.
 * - **`dialogs`** is beside the frame, inside the providers, for surfaces opened from places that
 *   share no parent. It is drawn while the rail is up and a session is held.
 */
export type ShellSlotProps = {
	'workspace-menu': {
		/** whether this is the rail before anybody has signed in, or with no workspace open. */
		signedOut: boolean;
		/** a workspace other than the open one was chosen: open it, by the path a sign-in takes. */
		onSwitch: (workspaceId: string) => void;
	};
	'account-menu': {
		/** whether this is the rail before anybody has signed in. */
		signedOut: boolean;
		/** the way in, which reaches the sign-in card. Only read while `signedOut`. */
		onWayIn: () => void;
	};
	dialogs: Record<string, never>;
};

/** A place in the shell, by name. */
export type ShellSlotName = keyof ShellSlotProps;

/** Something drawn at one of the shell's own places, and handed that place's props. */
export type ShellSlot = {
	[S in ShellSlotName]: { slot: S; component: Component<ShellSlotProps[S]> };
}[ShellSlotName];

/**
 * What a surface contributes to the kinds it depends on in the window, as `$lib/feature/feature`
 * says of a feature's `contributes`: a feature needing something of one that depends on it
 * declares the need as a type, and the depending feature's `surface.ts` declares the value.
 */
export type SurfaceContributing = {
	[K in keyof SurfaceContributions]?: Partial<SurfaceContributions[K]>;
};

/**
 * A read another feature answers for a page or a host through what it contributes: the query
 * itself, as the query library hands it back, of which a caller reads only this much.
 */
export type ContributedRead<T> = {
	readonly isPending: boolean;
	readonly isPlaceholderData: boolean;
	readonly data: T | undefined;
};

/**
 * **The window's contributions are provided, never imported.** A feature sits below the
 * composition root and may not import it, so `$lib/app/surfaces` merges every surface's
 * `contributes` and provides the result here once, when it is first evaluated; the frame and every
 * route import it, so it is in place before anything is drawn.
 *
 * **One hand-over for the whole window, not a prop per page.** A section reaches its page through
 * the route, but what a feature needs here is also needed where no route reaches: the host the
 * frame mounts, and an act run from the command menu. So a page, a host and an act all read
 * through {@link contributionsTo}, at call time: in a component's script as it is created, or when
 * an act runs.
 */
let provided: SurfaceContributions | null = null;

/** Provide what every surface contributes, merged. Called once, by `$lib/app/surfaces`. */
export function provideContributions(contributions: SurfaceContributions) {
	provided = contributions;
}

/**
 * What is contributed to one kind in the window. A feature reads its own kind's, and only at call
 * time.
 */
export function contributionsTo<K extends keyof SurfaceContributions>(
	kind: K
): SurfaceContributions[K] {
	if (provided === null) {
		throw new Error(
			'a contribution was read before the surfaces were composed: import `$lib/app/surfaces` first'
		);
	}

	return provided[kind];
}

/**
 * **The glyph of every kind is provided the same way**, by `$lib/app/surfaces` from what each
 * surface declares under `record`, since the one drawing a kind it does not hold, the role editor,
 * may not import the surface declaring it.
 */
let glyphs: Record<RecordKind, Icon> | null = null;

/**
 * Every kind's glyph, keyed by the kind, from a list of surfaces: what the composition root
 * provides. Typed from the list, so assigning it to a record over every kind is what finds a kind
 * no surface declares.
 */
export type GlyphsOf<D extends readonly object[]> = {
	[S in Extract<D[number], { record: RecordDeclaration }> as S['record']['kind']]: Icon;
};

/** Every declared kind's glyph, keyed by the kind, for the composition root to provide. */
export function glyphsOf<const D extends readonly object[]>(declarations: D): GlyphsOf<D> {
	return Object.fromEntries(
		declarations.flatMap((declaration) => {
			const { record } = declaration as { record?: RecordDeclaration };

			return record ? [[record.kind, record.glyph]] : [];
		})
	) as GlyphsOf<D>;
}

/** Provide every kind's glyph. Called once, by `$lib/app/surfaces`. */
export function provideGlyphs(provided: Record<RecordKind, Icon>) {
	glyphs = provided;
}

/** The glyph a kind of record is drawn with, as the surface holding it declares. */
export function glyphOf(kind: RecordKind): Icon {
	if (glyphs === null) {
		throw new Error(
			'a glyph was read before the surfaces were composed: import `$lib/app/surfaces` first'
		);
	}

	return glyphs[kind];
}

/**
 * Declare a surface, keeping every field as it was declared, so the composition root can type
 * what the list contributes from it.
 */
export const defineSurface = <const S extends Surface>(surface: S): S => surface;
