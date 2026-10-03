import { fireEvent } from '@testing-library/svelte';
import { expect, vi } from 'vitest';

/**
 * What the bounded settings directories are read by (effort 846, ticket 53): the list shell's
 * columns, a few rows in view at those columns (two cards at one across, four at two, nine at
 * three), and the rest scrolled to inside the directory's own area, under its tray.
 *
 * jsdom lays nothing out, so what is read is what the area is told: its bound, its name, where
 * the tray stands against it, and what it asks of the platform when the focus moves.
 */

/** the gap between two tiles, the list shell's `gap-3`, and the padding round them in the area. */
const GAP = 12;
const PADDING = 4;

/** the bounded area a directory's grid scrolls in, read from the grid it holds. */
export const areaOf = (grid: Element) => grid.closest<HTMLElement>('[data-directory-scroll]');

/** the height the area may grow to: the rows in view at these columns, their gaps, and the padding. */
export const boundOf = (tileHeight: number, columns: number) => {
	const rows = Math.max(2, columns);

	return `${rows * tileHeight + (rows - 1) * GAP + PADDING * 2}px`;
};

/**
 * the area is a named region holding the grid, bounded at the rows in view and no more, and the
 * tray is above it, outside it.
 */
export const expectBoundedArea = (
	grid: HTMLElement,
	{ tileHeight, columns, legendId }: { tileHeight: number; columns: number; legendId: string }
) => {
	const area = areaOf(grid);

	expect(area).not.toBeNull();
	expect(area!.getAttribute('role')).toBe('region');
	expect(area!.getAttribute('aria-labelledby')).toBe(legendId);
	expect(document.getElementById(legendId)).not.toBeNull();
	expect(area!.classList).toContain('overflow-y-auto');
	expect(grid.dataset.columns).toBe(String(columns));
	expect(area!.dataset.rows).toBe(String(Math.max(2, columns)));
	// a bound, not a height: with fewer cards the area is as tall as they are and no taller.
	expect(area!.style.maxHeight).toBe(boundOf(tileHeight, columns));
	expect(area!.style.height).toBe('');
	expect(area!.style.minHeight).toBe('');

	// the tray (search, sort, plus) stands before the area and outside it.
	const tray = area!.parentElement!.closest('fieldset')!.querySelector('[data-directory-tray]')!;

	expect(tray).not.toBeNull();
	expect(area!.contains(tray)).toBe(false);
	expect(tray.compareDocumentPosition(area!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(tray.querySelector('input')).not.toBeNull();
};

/**
 * keyboard focus reaching a card brings the whole card into view at once, with no smooth scroll
 * for reduced motion to stop; a press brings nothing, so the card under the pointer stays put.
 */
export const expectFocusScrollsTile = async (tile: HTMLElement) => {
	const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});

	try {
		const link = tile.querySelector<HTMLElement>('a')!;

		await fireEvent.focusIn(link);

		expect(scrolled).toHaveBeenCalledTimes(1);
		expect(scrolled.mock.contexts[0]).toBe(tile);
		expect(scrolled.mock.calls[0][0]).toEqual({ block: 'nearest', inline: 'nearest' });

		scrolled.mockClear();
		await fireEvent.pointerDown(link);
		await fireEvent.focusIn(link);
		await fireEvent.pointerUp(link);

		expect(scrolled).not.toHaveBeenCalled();
	} finally {
		scrolled.mockRestore();
	}
};

/**
 * the foot of the area fades while cards stand below what it shows, and stops at the end. The
 * area's sizes are stood in for, since jsdom measures nothing.
 */
export const expectFadeWhileMoreBelow = async (area: HTMLElement) => {
	const sizes = { scrollTop: 0, clientHeight: 400, scrollHeight: 900 };

	for (const key of Object.keys(sizes) as (keyof typeof sizes)[]) {
		Object.defineProperty(area, key, { configurable: true, get: () => sizes[key] });
	}

	await fireEvent.scroll(area);

	expect(area.hasAttribute('data-more-below')).toBe(true);
	expect(area.className).toContain('mask-image');

	sizes.scrollTop = 500;
	await fireEvent.scroll(area);

	expect(area.hasAttribute('data-more-below')).toBe(false);
	expect(area.className).not.toContain('mask-image');
};

/** the area is laid in logical terms alone, so it mirrors in Arabic with nothing to undo. */
export const expectNoPhysicalSides = (area: HTMLElement) => {
	expect(
		Array.from(area.classList).filter((name) =>
			/^-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r)(?:-|$)/.test(name)
		)
	).toEqual([]);
};
