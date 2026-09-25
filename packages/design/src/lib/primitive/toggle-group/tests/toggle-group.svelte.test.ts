import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Harness from '#tests/toggle-group-harness.svelte';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * A SEGMENT KEEPS ITS PADDING
 *
 * A segment of a segmented control is at least as wide as its label and its side padding, however
 * narrow the row it sits in. The item carried `min-w-0`, which lets a flex item shrink past its
 * own content: on the member sheet, where each segment is also `flex-1`, "administrator" was
 * squeezed into its padding until its letters met its edges (ticket 42 of effort 832, seen by the
 * human in the running build).
 *
 * jsdom lays nothing out, so what is asserted is the class list the item renders with, which is
 * the whole of what decides it: `min-w-fit` holds the segment at its content, and nothing that
 * lets it go below.
 */

const segments = (className = '') => {
	render(
		Harness,
		{ class: className },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({}), direction: 'ltr' }
		}
	);

	return [
		screen.getByRole('radio', { name: 'member' }),
		screen.getByRole('radio', { name: 'manager' })
	];
};

test('a segment never shrinks below its label and its side padding', () => {
	for (const segment of segments()) {
		const classes = segment.className.split(/\s+/);

		expect(classes).toContain('min-w-fit');
		expect(classes).toContain('px-3');
		expect(classes).not.toContain('min-w-0');
	}
});

test('a segment asked to share the row still keeps its floor', () => {
	for (const segment of segments('flex-1')) {
		const classes = segment.className.split(/\s+/);

		expect(classes).toContain('flex-1');
		expect(classes).toContain('min-w-fit');
		expect(classes).not.toContain('min-w-0');
	}
});
