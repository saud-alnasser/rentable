import { fireEvent } from '@testing-library/svelte';

/**
 * Opening a select under the component runner.
 *
 * Scaffolding rather than a test, in the `tests/` directory of the module it serves, the way
 * `design/tests/strings.ts` is ([[rules/testing]], *Component tests*).
 *
 * **A select trigger opens on a pointer gesture, not on a click.** bits-ui listens for
 * `pointerdown` and takes pointer capture, so a `click` alone leaves the listbox closed and the
 * test then fails looking for options that were never rendered. Measured on 2026-09-14 against
 * bits-ui under jsdom: the pointer pair opens it, and a subsequent `keydown` of Enter closes it
 * again, which is why this fires the pair and nothing else.
 *
 * **jsdom implements no pointer capture at all**, so the same gesture throws
 * `target?.hasPointerCapture is not a function` before anything opens. The three methods are
 * filled in here, once, on import, and each is left alone where an environment already has one.
 * `scrollIntoView` is the same kind of hole: the listbox scrolls the chosen item into view as it
 * opens.
 */
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

/** open the listbox of the select the trigger belongs to. */
export const openSelect = async (trigger: HTMLElement) => {
	await fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
	await fireEvent.pointerUp(trigger, { pointerType: 'mouse', button: 0 });
};

/**
 * choose one option of an open listbox.
 *
 * An item commits on `pointerup` as well, and a `click` on one leaves the value where it was, so
 * the gesture is the same pair without the press: the pointer is moved onto the item first,
 * because that is what makes it the highlighted one.
 */
export const chooseOption = async (option: HTMLElement) => {
	await fireEvent.pointerMove(option, { pointerType: 'mouse' });
	await fireEvent.pointerUp(option, { pointerType: 'mouse', button: 0 });
};
