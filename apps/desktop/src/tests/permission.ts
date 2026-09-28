// Shared scaffolding for the component tests that read what a record control offers a reader who
// may not do everything (effort 838, requirement 10). Not a `*.test.ts` file, so the test runner
// does not pick it up directly. Here rather than in one module's `tests/` because every record
// concept's tests read through it ([[rules/testing]], *Component tests*).

import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { expect } from 'vitest';

import PaletteHarness from './palette-harness.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { memberPermissions, type RecordFlag } from '$lib/workspace/permission';
import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';

/** hold a reader who holds every flag but these, on a full-access grant. */
export function holdEveryFlagBut(...lacking: RecordFlag[]) {
	memberPermissions.hold({
		permissions: maskOf(...EVERY_FLAG.filter((flag) => !(lacking as string[]).includes(flag))),
		accessLevel: 'full-access'
	});
}

/** hold a reader whose role carries every flag, on a read-only grant. */
export function holdReadOnly() {
	memberPermissions.hold({ permissions: maskOf(...EVERY_FLAG), accessLevel: 'read-only' });
}

/** forget the reader, as signing out does. */
export function forgetReader() {
	memberPermissions.hold(null);
}

/** what an element's `aria-describedby` names, as assistive technology hears it. */
export const describedBy = (element: Element | null | undefined) =>
	document.getElementById(element?.getAttribute('aria-describedby') ?? '')?.textContent?.trim();

/** every refused control on the page, by the words it starts with, with the reason it gives. */
export const refusedControls = () =>
	[...document.querySelectorAll<HTMLElement>('[data-unavailable]')].map((control) => ({
		text: control.textContent?.trim() ?? '',
		reason: describedBy(control),
		ariaDisabled: control.getAttribute('aria-disabled')
	}));

/** the refused control whose words start with `label`, or nothing where none is refused. */
export const refusedControl = (label: string) =>
	refusedControls().find((control) => control.text.toLowerCase().startsWith(label.toLowerCase()));

/** the command menu, drawn alone and opened with Mod+K. */
export async function openPalette() {
	render(PaletteHarness, { strings, direction: 'ltr' });

	await fireEvent.keyDown(
		document.body,
		usesAppleKeyboard() ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true }
	);

	await waitFor(() => expect(document.querySelector('[role=dialog]')).not.toBeNull());
}

/** the command menu's row keyed on `value`: an act's id, or `create.<subject>`. */
export const paletteRow = (value: string) =>
	document.querySelector<HTMLElement>(`[data-slot=command-item][data-value="${value}"]`);

/**
 * jsdom lays nothing out, so a list's viewport is given a size its virtualiser can fill, and what a
 * list measures itself with is filled in where it is missing. A tooltip is placed against its
 * trigger with the same `ResizeObserver`, so a test reading a reason from one calls this too, and
 * no test stands in one of its own.
 */
export function layOutLists() {
	Element.prototype.scrollIntoView ??= () => {};
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
