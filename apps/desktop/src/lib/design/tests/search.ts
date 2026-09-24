import { fireEvent, render, within } from '@testing-library/svelte';
import { expect } from 'vitest';

import { SEARCH_DEBOUNCE_MS } from '$lib/design/block/search-field.svelte';
import ShortcutListener from '$lib/layout/component/shortcut-listener.svelte';

/**
 * THE SHARED SEARCH, READ ON A SURFACE
 *
 * Scaffolding rather than a test. Every set a person can search draws `search-field.svelte`, and
 * each surface's own test reads the same three things off it with these: the glass, the wait
 * before a keystroke becomes the search, and `/` putting the cursor in the field. They are one
 * module so the three surfaces are held to one definition of "searches the same way", rather than
 * to three that could drift as the surfaces did.
 */

/** the field a surface drew, found by the mark the shared component carries and nothing else. */
export function searchField(): HTMLInputElement {
	const holder = document.querySelector<HTMLElement>('[data-search-field]');

	expect(holder, 'the surface draws the shared search field').not.toBeNull();

	return within(holder!).getByRole('textbox') as HTMLInputElement;
}

/** the glass the shared field leads with. */
export function searchGlass() {
	return document.querySelector('[data-search-field] svg.lucide-search');
}

/** type a term into the surface's field, the way a keystroke does. */
export async function typeSearch(term: string) {
	await fireEvent.input(searchField(), { target: { value: term } });
}

/** a moment that is well inside the field's wait, so nothing has been searched yet. */
export function insideTheWait() {
	return new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS / 3));
}

/** a moment past the field's wait, so the term has become the search. */
export function pastTheWait() {
	return new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100));
}

/**
 * Press `/` from outside any field, through the application's one listener, the way a reader on
 * the surface does. The listener is rendered beside the surface, as the frame renders it.
 */
export async function pressSearchKey() {
	render(ShortcutListener);

	(document.activeElement as HTMLElement | null)?.blur();
	await fireEvent.keyDown(document.body, { key: '/' });
}
