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
 * **The keys divide by what renders them.** The seventeen the primitives read are almost all
 * accessible names rather than visible words, which is why they read as labels for controls
 * rather than as sentences: `next` and `previous` are the exceptions a pagination control puts
 * beside its glyph at the wider sizes, and `commandPalette`, `commandPaletteDescription`,
 * `sidebar` and `mobileSidebarDescription` go into headers marked `sr-only`, which is a dialog's
 * required title and description present for a reader who cannot see the surface carrying them.
 * The eleven the blocks added at #781 are the other kind, and are read aloud by nothing: they are
 * the sentences and control words on a composed surface, which are the surface's own rather than
 * its caller's. #782 added six more of that kind, when the export dialog and the record card
 * crossed: five of them the dialog's, and `openMenu` the card's.
 *
 * **One key is a function and every other one is a string.** `moreRecords` counts the records a
 * selection dialog decided not to name, which is arithmetic over a plan the consumer handed in
 * and therefore a number no consumer could have resolved the phrase against. When a key belongs
 * here at all is [[rules/frontend]]'s, and it turns on which side knows the number.
 *
 * The type is the first enforcement and not the only one. A consumer whose object is missing a
 * key fails `svelte-check` at the place it renders the provider, and the message names the key;
 * what that cannot see is a consumer which renders no provider at all, and `useDesignContract`
 * below is what catches that.
 */
export type DesignStrings = {
	/** the accessible name of the trail a breadcrumb renders, on the `nav` that holds it. */
	breadcrumb: string;
	/** the word on the control that leaves a dialog without doing the thing it asked about. */
	cancel: string;
	/** what closes a surface without acting: the corner control on a dialog and a sheet, and the
	 * footer word on a block whose surface has nothing to confirm. */
	close: string;
	/** the command palette's title, rendered into a header only a screen reader reaches. */
	commandPalette: string;
	/** the command palette's description, in the same header and required beside the title. */
	commandPaletteDescription: string;
	/** the word on the control that destroys the record, and the delete dialog's own title. */
	delete: string;
	/** what a delete dialog says in place of {@link DesignStrings.deleteDescription} where
	 * something still depends on the record, and there is no destructive control to describe. */
	deleteBlockedDescription: string;
	/** what a delete dialog says the deletion costs, on its own line under the record it names. */
	deleteDescription: string;
	/** the word that replaces {@link DesignStrings.delete} while the deletion is in flight. */
	deleting: string;
	/** the word on the control that writes the list out, and the export dialog's own title. */
	export: string;
	/** what the export dialog asks, which is which of the two files this should become. */
	exportDescription: string;
	/** what the delimited format is called on the control that chooses it. */
	formatCsv: string;
	/** what the workbook format is called on the control that chooses it. */
	formatXlsx: string;
	/** the accessible name of a pagination control that advances a page. */
	goToNextPage: string;
	/** the accessible name of a pagination control that goes back a page. */
	goToPreviousPage: string;
	/** the accessible name of a spinner, which is a `role="status"` with nothing else to read. */
	loading: string;
	/**
	 * what a record surface says beneath its spinner while the record is still being read.
	 *
	 * **A sentence about the record, not about the application.** This block is shared by every
	 * concept, so it cannot name which kind of record is on its way, and a consumer that supplies
	 * its own startup message here tells a reader waiting on one record that the whole application
	 * is loading. That is what the desktop did until this key got a sentence of its own.
	 */
	loadingRecord: string;
	/** what the sidebar's drawer presentation says it is, beside {@link DesignStrings.sidebar}. */
	mobileSidebarDescription: string;
	/** what a breadcrumb's ellipsis stands for, which is the crumbs it collapsed. */
	more: string;
	/** what a pagination ellipsis stands for, which is the pages it collapsed. */
	morePages: string;
	/** how a selection dialog names the refused records it had no room to list, given how many
	 * were left out. The one key that takes an argument; the docstring above has why. */
	moreRecords: (count: number) => string;
	/** the visible word on a pagination control that advances a page. */
	next: string;
	/** the accessible name of a carousel control that advances a slide. */
	nextSlide: string;
	/** what a record surface says in place of the record where there is no such record. */
	noResults: string;
	/** what a selection dialog says where the plan it was handed turned every record away. */
	nothingToDo: string;
	/** the accessible name of the quiet control that opens a record card's own actions. */
	openMenu: string;
	/** the accessible name of the navigation a pagination control renders. */
	pagination: string;
	/** what goes back: the visible word on a pagination control, and the accessible name of the
	 * control a record surface puts above the record. */
	previous: string;
	/** the accessible name of a carousel control that goes back a slide. */
	previousSlide: string;
	/** what the sidebar's drawer presentation is titled, for a reader who cannot see it. */
	sidebar: string;
	/** the accessible name of both controls that fold and unfold the sidebar. */
	toggleSidebar: string;
	/** what a confirmation reports where the action failed for a reason it has no words for. */
	unexpectedError: string;
	/** what a delete dialog calls the record where its surface passed no name for it. */
	unnamedRecord: string;
	/** the word that replaces {@link DesignStrings.export} while the file is being written. */
	working: string;
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
 * rather than on render. `card`, `toggle-group`, `breadcrumb`, `carousel`, `pagination`, the
 * sidebar's own chrome, `block/record-surface` and `block/back-control` throw at render, because
 * they are the ones that are not overlays. **`block/delete-dialog` throws at render as well, and
 * it is an overlay.** Its own script reads the contract to default four of its props, before
 * `bits-ui` has decided anything, and consumers mount it closed rather than behind an `{#if}`,
 * so it runs when the page holding it first draws. The laziness is `Dialog.Content`'s, not the
 * wrapper's, and any overlay that defaults a prop from the contract loses it the same way. A test that renders a subtree and asserts it survives is therefore
 * proving less than it looks, unless the subject is one of those or the overlay is opened.
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
