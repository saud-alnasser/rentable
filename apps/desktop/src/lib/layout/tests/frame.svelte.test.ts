import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { setLocale } from '$lib/i18n/i18n-svelte';
import Frame from '$lib/layout/component/frame.svelte';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * WHAT OF THE FRAME REACHES PAPER
 *
 * Ticket 05 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 10: a
 * printed page is the print sheet alone, never the application around it. The frame's regions
 * each hide themselves under `@media print` (`print:hidden`), and the sheet shows itself there
 * (`print:block`), so this renders the frame in each of its three states and holds every region
 * it draws beside the sheet to the rule. A region added later without it fails here.
 *
 * jsdom applies no media query, so what is asserted is the rule on the element, which is what
 * Tailwind turns into `@media print { display: none }`. What a dialog or a toast portals outside
 * the frame is `app.css`'s to hide, and the printed page is checked by hand (criterion 10(c)).
 */

// the window the controls ask about, which jsdom has none of.
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({
		isMaximized: async () => false,
		isFullscreen: async () => false,
		onResized: async () => () => {}
	})
}));

// the rail's contents read the startup unit the root layout provides; where the rail sits is the
// frame's, and that is what is under test, so it draws nothing here.
vi.mock('$lib/layout/component/sidebar.svelte', () => ({ default: () => {} }));

beforeAll(() => {
	loadLocale('en');
	setLocale('en');
	// the two browser facts the rail's state reaches for, as `account-menu.svelte.test.ts` stubs
	// them: the shell breakpoint the stylesheet declares, read through `matchMedia`, and the
	// `ResizeObserver` floating-ui measures with.
	document.documentElement.style.setProperty('--breakpoint-shell', '48rem');
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

afterEach(() => {
	document.body.innerHTML = '';
});

const children = createRawSnippet(() => ({ render: () => '<p data-route>a screen</p>' }));

const SHELLS = ['bare', 'signed-out', 'full'] as const;

for (const shell of SHELLS) {
	test(`the ${shell} frame draws the sheet once, and every other region it draws is hidden on paper`, () => {
		const { container } = render(
			Frame,
			{ currentDirection: 'ltr', shell, children },
			{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
		);

		const sheets = container.querySelectorAll('[data-print-sheet]');

		expect(sheets).toHaveLength(1);

		const [sheet] = sheets;

		expect(sheet.classList.contains('print:block')).toBe(true);
		expect(sheet.classList.contains('print:hidden')).toBe(false);

		// the regions are the sheet's siblings: everything the frame draws at the level the sheet
		// is drawn at. What is inside one of them goes with it.
		const regions = [...(sheet.parentElement?.children ?? [])].filter(
			(element) => element !== sheet
		);

		expect(regions.length).toBeGreaterThan(0);
		// the route is inside a hidden region, not beside the sheet.
		expect(regions.some((region) => region.querySelector('[data-route]'))).toBe(true);

		for (const region of regions) {
			expect(
				region.classList.contains('print:hidden'),
				`<${region.tagName.toLowerCase()} class="${region.className}"> reaches paper`
			).toBe(true);
		}
	});
}
