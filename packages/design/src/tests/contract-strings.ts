import type { DesignStrings } from '#lib/strings.js';

/**
 * A complete set of strings for a test that cares about one of them.
 *
 * Scaffolding rather than a test. The contract is 34 keys, and a call site writing all of them
 * out would be 33 lines of noise around the one being asserted.
 *
 * **Every default is the key's own name in braces**, which is a value no component here renders
 * literally and no locale file contains. So a test that asserts a word reached the DOM supplies
 * that word itself, and a component that renders a hard-coded English string rather than the one
 * it was handed fails instead of passing by coincidence. `moreRecords` is a function and puts
 * the count in the same braces, so a caller that passes the wrong number is visible too.
 *
 * It enumerates the keys rather than deriving them, and that is deliberate: the type erases at
 * runtime, so writing them out is what makes a key added to the contract and forgotten here a
 * `check` failure rather than an undefined string reaching a test.
 */
export function suppliedStrings(overrides: Partial<DesignStrings> = {}): DesignStrings {
	return {
		breadcrumb: '{breadcrumb}',
		cancel: '{cancel}',
		close: '{close}',
		commandPalette: '{commandPalette}',
		commandPaletteDescription: '{commandPaletteDescription}',
		delete: '{delete}',
		deleteBlockedDescription: '{deleteBlockedDescription}',
		deleteDescription: '{deleteDescription}',
		deleting: '{deleting}',
		export: '{export}',
		exportDescription: '{exportDescription}',
		formatCsv: '{formatCsv}',
		formatXlsx: '{formatXlsx}',
		goToNextPage: '{goToNextPage}',
		goToPreviousPage: '{goToPreviousPage}',
		loading: '{loading}',
		loadingRecord: '{loadingRecord}',
		mobileSidebarDescription: '{mobileSidebarDescription}',
		more: '{more}',
		morePages: '{morePages}',
		moreRecords: (count) => `{moreRecords ${count}}`,
		next: '{next}',
		nextSlide: '{nextSlide}',
		noResults: '{noResults}',
		nothingToDo: '{nothingToDo}',
		openMenu: '{openMenu}',
		pagination: '{pagination}',
		previous: '{previous}',
		previousSlide: '{previousSlide}',
		sidebar: '{sidebar}',
		toggleSidebar: '{toggleSidebar}',
		unexpectedError: '{unexpectedError}',
		unnamedRecord: '{unnamedRecord}',
		working: '{working}',
		...overrides
	};
}
