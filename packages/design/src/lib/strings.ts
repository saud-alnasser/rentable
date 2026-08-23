import { getContext } from 'svelte';

/**
 * The contract a consumer satisfies once, at its root, so that everything this package renders
 * can be read.
 *
 * **The failure this exists to prevent has no error attached to it.** A component that lost its
 * translation read still compiles and still renders; what it produces is English words and a
 * left-to-right layout on a screen somebody is reading right to left, and nothing anywhere
 * reports it. So the words and the reading direction come in from outside, and a consumer that
 * supplies neither does not build.
 *
 * **The direction rides in the same object as the words, deliberately.** It is ambient in the
 * same way they are: a family that needs it sets it on the element it renders and every call
 * site wants the same value, so threading it through them would buy the same compile error at
 * several hundred times the cost.
 *
 * **Almost every key below is an accessible name rather than a visible word**, which is why the
 * keys read as labels for controls rather than as sentences. `next` and `previous` are the
 * exceptions: a pagination control renders both of them beside its glyph at the wider sizes.
 * `commandPalette`, `commandPaletteDescription`, `sidebar` and `mobileSidebarDescription` are
 * rendered into headers marked `sr-only`, which is a dialog's required title and description
 * present for a reader who cannot see the surface that carries them.
 *
 * The type is the first enforcement and not the only one. A consumer whose object is missing a
 * key fails `svelte-check` at the place it renders the provider, and the message names the key;
 * what that cannot see is a consumer which renders no provider at all, and `useDesignContract`
 * below is what catches that.
 */
export type DesignStrings = {
	/** the accessible name of the trail a breadcrumb renders, on the `nav` that holds it. */
	breadcrumb: string;
	/** the label on the close control a dialog and a sheet each render in their corner. */
	close: string;
	/** the command palette's title, rendered into a header only a screen reader reaches. */
	commandPalette: string;
	/** the command palette's description, in the same header and required beside the title. */
	commandPaletteDescription: string;
	/** the accessible name of a pagination control that advances a page. */
	goToNextPage: string;
	/** the accessible name of a pagination control that goes back a page. */
	goToPreviousPage: string;
	/** the accessible name of a spinner, which is a `role="status"` with nothing else to read. */
	loading: string;
	/** what the sidebar's drawer presentation says it is, beside {@link DesignStrings.sidebar}. */
	mobileSidebarDescription: string;
	/** what a breadcrumb's ellipsis stands for, which is the crumbs it collapsed. */
	more: string;
	/** what a pagination ellipsis stands for, which is the pages it collapsed. */
	morePages: string;
	/** the visible word on a pagination control that advances a page. */
	next: string;
	/** the accessible name of a carousel control that advances a slide. */
	nextSlide: string;
	/** the accessible name of the navigation a pagination control renders. */
	pagination: string;
	/** the visible word on a pagination control that goes back a page. */
	previous: string;
	/** the accessible name of a carousel control that goes back a slide. */
	previousSlide: string;
	/** what the sidebar's drawer presentation is titled, for a reader who cannot see it. */
	sidebar: string;
	/** the accessible name of both controls that fold and unfold the sidebar. */
	toggleSidebar: string;
};

/** which way the reader reads, supplied rather than derived because the package has no locale. */
export type DesignDirection = 'ltr' | 'rtl';

/**
 * What a packaged component reads. Both members are getters over the provider's props, so a
 * consumer that switches language mid-session moves every packaged component with it.
 */
export type DesignContract = {
	readonly strings: DesignStrings;
	readonly direction: DesignDirection;
};

/**
 * The key the provider writes under.
 *
 * A symbol rather than a string because context keys are a flat namespace shared with every
 * library a consumer happens to render inside, and a string collides silently.
 */
export const DESIGN_CONTRACT = Symbol('rentable.design.contract');

/**
 * Read the contract from the nearest provider.
 *
 * **It throws rather than falling back.** A fallback is the silently English render this whole
 * mechanism exists to make impossible, and type-checking cannot see a missing provider: the
 * consumer's object is only checked where it renders one, so an application that renders none is
 * type-correct and wordless. The throw is the only thing left to catch it.
 *
 * **It fires when the calling component initialises, which for most of the package is not when
 * the screen draws.** Most of the families that read this are overlays whose content `bits-ui`
 * instantiates only once they open, so a missing provider surfaces on the first interaction
 * rather than on render. `card`, `toggle-group`, `breadcrumb`, `carousel`, `pagination` and the
 * sidebar's own chrome throw at render, because they are the ones that are not overlays. A test
 * that renders a subtree and asserts it survives is therefore proving less than it looks, unless
 * the subject is one of those or the overlay is opened.
 */
export function useDesignContract(): DesignContract {
	const contract = getContext<DesignContract | undefined>(DESIGN_CONTRACT);

	if (!contract) {
		throw new Error(
			'a @rentable/design component rendered outside DesignProvider. render the provider once at the root of the application, with the strings and the reading direction for the reader.'
		);
	}

	return contract;
}

export { default as DesignProvider } from './strings-provider.svelte';
