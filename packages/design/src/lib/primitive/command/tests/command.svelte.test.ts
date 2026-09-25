import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import CommandHarness from '#tests/command-harness.svelte';
import DialogHarness from '#tests/dialog-harness.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The command palette's title and description, which are the two strings in this package that
 * arrive as prop defaults rather than as rendered expressions.
 *
 * **That is why the contract is read above `$props()` in `command-dialog.svelte`** and below it
 * everywhere else: a default is evaluated inside the destructuring, so the value has to exist by
 * the time the destructuring runs. Move the read back down and this fails to compile rather than
 * failing to render, which is the better of the two.
 *
 * Both are rendered into a header marked `sr-only`, because a dialog is required to have them and
 * this one has no visible heading. Each is read off the element that should carry it, because the
 * two are interchangeable to a test that only asks whether a word is somewhere on the page.
 *
 * The fixture opens the dialog rather than driving a trigger, because `bits-ui` instantiates the
 * content only once it is open and an unopened dialog is a test that renders nothing.
 */
test('the palette is titled and described by the strings the contract supplied', () => {
	render(
		CommandHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({
					commandPalette: 'لوحة الأوامر',
					commandPaletteDescription: 'ابحث عن أمر لتشغيله'
				}),
				direction: 'rtl'
			}
		}
	);

	expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe('لوحة الأوامر');
	expect(document.querySelector('[data-slot="dialog-description"]')?.textContent).toBe(
		'ابحث عن أمر لتشغيله'
	);
});

/**
 * The palette is reached from the keyboard many times a day, so it answers at once: neither the
 * panel nor the overlay under it animates in or out, and nothing inside it transitions as the
 * highlighted row moves. A dialog opened for anything else still animates, which is the second test
 * and what keeps the first from passing because the dialog stopped animating everywhere.
 */
const MOVING = /(^|:)(animate-(in|out)|transition(-|$))/;

const moving = (selector: string) =>
	[...document.querySelectorAll(selector)].flatMap((element) =>
		[...element.classList].filter((token) => MOVING.test(token))
	);

test('the palette opens and closes without animating, and its rows carry no transition', () => {
	render(
		CommandHarness,
		{},
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings(), direction: 'ltr' } }
	);

	expect(document.querySelector('[data-slot="dialog-content"]')).not.toBe(null);
	expect(moving('[data-slot="dialog-content"]')).toEqual([]);
	expect(moving('[data-slot="dialog-overlay"]')).toEqual([]);
	expect(moving('[data-slot="dialog-content"] [data-slot^="command"]')).toEqual([]);
});

test('a dialog that is not the palette still animates in and out', () => {
	render(
		DialogHarness,
		{},
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings(), direction: 'ltr' } }
	);

	expect(moving('[data-slot="dialog-content"]')).toEqual(
		expect.arrayContaining(['data-[state=open]:animate-in', 'data-[state=closed]:animate-out'])
	);
});
