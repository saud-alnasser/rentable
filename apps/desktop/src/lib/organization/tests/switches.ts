import { fireEvent } from '@testing-library/svelte';

/**
 * Opens the folded groups of the switch list (`permission-switches.svelte`), every one or the one
 * `family` names, inside `within`: what a reader presses before turning a switch in a group,
 * since a folded group draws none of its rows (effort 838, ticket 57). A group already open is
 * left open.
 */
export const unfold = async (family?: string, within: ParentNode = document) => {
	const selector = family ? `[data-switches-fold="${family}"]` : '[data-switches-fold]';

	for (const fold of Array.from(within.querySelectorAll<HTMLElement>(selector))) {
		if (fold.getAttribute('aria-expanded') !== 'true') await fireEvent.click(fold);
	}
};
