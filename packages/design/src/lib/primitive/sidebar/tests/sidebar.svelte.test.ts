import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import SidebarHarness from '#tests/sidebar-harness.svelte';
import SidebarMenuHarness from '#tests/sidebar-menu-harness.svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The four strings a sidebar renders, and the two presentations they are split across.
 *
 * Both controls that fold it carry the same word and neither prints it: the rail is a
 * four-pixel strip with no content, so the supplied string is the entirety of what it announces,
 * and the trigger is a glyph with the same word beside it marked `sr-only`. The other two are the
 * drawer's title and description, which a dialog is required to carry and which only exist while
 * the window is narrow enough for the sidebar to present as one.
 *
 * **Two browser facts have to be supplied before any of this renders**, and both are the
 * sidebar's rather than this file's invention. `SidebarState` decides between the two
 * presentations from a media query built out of `--breakpoint-shell`, which
 * `@rentable/design/tokens.css` declares and jsdom loads no stylesheet to carry; and `matchMedia`
 * is a browser API jsdom does not implement at all. What the stub answers is what decides which
 * presentation the test is looking at.
 */
function inAWindowThatIs(width: 'wide' | 'narrow') {
	document.documentElement.style.setProperty('--breakpoint-shell', '48rem');

	// floating-ui measures the element a tooltip is anchored to, and jsdom implements neither of
	// the two browser APIs it reaches for.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	window.matchMedia = ((query: string) => ({
		matches: width === 'narrow',
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
}

test('both fold controls are named by the string the contract supplied', () => {
	inAWindowThatIs('wide');

	render(
		SidebarHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({ toggleSidebar: 'طي القائمة الجانبية' }),
				direction: 'rtl'
			}
		}
	);

	const rail = screen.getByLabelText('طي القائمة الجانبية');
	const trigger = document.querySelector('[data-sidebar="trigger"]');

	expect(rail.getAttribute('data-sidebar')).toBe('rail');
	expect(rail.getAttribute('title')).toBe('طي القائمة الجانبية');
	expect(trigger?.querySelector('span')?.textContent).toBe('طي القائمة الجانبية');
});

/**
 * The drawer's title and description, which are the two keys nothing else reaches.
 *
 * They are rendered into a header marked `sr-only`, because the drawer is a dialog and a dialog
 * is required to have both. Nothing sees them, this application draws the drawer at a width its
 * window never takes today, and neither fact makes them optional: a reader on a narrow window
 * with a screen reader is given these two sentences and nothing else about what just opened.
 *
 * It is opened by pressing the trigger rather than by setting state, because `toggle` is what
 * decides which of the two things pressing it means and the drawer is the branch where it means
 * this one.
 */
test('the drawer says what it is in the words the contract supplied', async () => {
	inAWindowThatIs('narrow');

	render(
		SidebarHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({
					sidebar: 'القائمة الجانبية',
					mobileSidebarDescription: 'يعرض القائمة الجانبية للجوال.'
				}),
				direction: 'rtl'
			}
		}
	);

	await fireEvent.click(document.querySelector('[data-sidebar="trigger"]') as HTMLElement);

	const drawer = screen.getByRole('dialog');

	expect(drawer.querySelector('[data-slot="sheet-title"]')?.textContent).toBe('القائمة الجانبية');
	expect(drawer.querySelector('[data-slot="sheet-description"]')?.textContent).toBe(
		'يعرض القائمة الجانبية للجوال.'
	);
});

/**
 * The sidebar's second read of the direction, and the one that is not an attribute.
 *
 * A folded sidebar is a column of glyphs, and the tooltip naming each of them stands beside it.
 * Which side that is follows the reader rather than the layout: in Arabic the sidebar is at the
 * right edge of the window, so a tooltip on its right is a tooltip off the screen. Nothing about
 * getting it wrong is an error, and the two directions differ by one word in a `$derived`.
 *
 * The tooltip is opened by pointing at the row, which is the only way it opens.
 */
for (const [direction, side] of [
	['rtl', 'left'],
	['ltr', 'right']
] as const) {
	test(`a tooltip stands on the ${side} of a sidebar read ${direction}`, async () => {
		inAWindowThatIs('wide');

		render(
			SidebarMenuHarness,
			{},
			{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings(), direction } }
		);

		await fireEvent.pointerEnter(document.querySelector('[data-tooltip-trigger]') as HTMLElement, {
			pointerType: 'mouse'
		});

		expect(document.querySelector('[data-slot="tooltip-content"]')?.getAttribute('data-side')).toBe(
			side
		);
	});
}
