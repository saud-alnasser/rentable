import { render } from '@testing-library/svelte';
import { afterEach, expect, test } from 'vitest';
import * as Cell from '$lib/design/cell/index.ts';

/**
 * A READER'S WORDS KEEP THEIR OWN ORDER
 *
 * Ticket 29 of effort 832, from the walk of ticket 27: on the contracts directory, a unit's page,
 * the complexes directory and a complex's page, "Adeline Wiegand Sr." rendered as
 * ".Adeline Wiegand Sr" in Arabic and "4253 Russel Motorway" as "Russel Motorway 4253". A run of
 * Latin letters is laid out left to right, but the period or the number at its edge is neutral and
 * takes the paragraph's direction, which in Arabic sends it to the other end.
 *
 * jsdom lays nothing out, so, as `phone.svelte.test.ts` says for the phone rule, the order the
 * glyphs land in is not observable. The mechanism is: the value is rendered under an ancestor that
 * is `rtl`, and what is asserted is that it sits in an isolate of its own inside the box the caller
 * styles, rather than taking the ancestor's direction.
 */

const NAME = 'Adeline Wiegand Sr.';
const ADDRESS = '4253 Russel Motorway';

function renderUnderRtl(text: string) {
	document.body.dir = 'rtl';

	return render(Cell.Text, { text, class: 'truncate text-sm font-medium' });
}

afterEach(() => {
	document.body.dir = '';
});

test('a name ending in a period is isolated under rtl', () => {
	const { container } = renderUnderRtl(NAME);
	const isolate = container.querySelector('bdi');

	expect(isolate?.textContent).toBe(NAME);
	expect(isolate?.closest('[dir]')).toBe(document.body);
	expect(document.body.dir).toBe('rtl');
});

test('an address starting with a number is isolated under rtl', () => {
	const { container } = renderUnderRtl(ADDRESS);

	expect(container.querySelector('bdi')?.textContent).toBe(ADDRESS);
});

test('the isolate is inside the styled box, so the box keeps the reader direction and its edge', () => {
	const { container } = renderUnderRtl(NAME);
	const box = container.querySelector('bdi')?.parentElement;

	// `dir` on the box itself would align a Latin name to the left of an Arabic row.
	expect(box?.tagName).toBe('SPAN');
	expect(box?.hasAttribute('dir')).toBe(false);
	expect(box?.className).toBe('truncate text-sm font-medium');
});
