import { render } from '@testing-library/svelte';
import { afterEach, expect, test } from 'vitest';
import * as Cell from '$lib/design/cell/index.ts';

/**
 * THE PHONE RULE
 *
 * `phone.svelte` states it in its own header: a number carrying a leading `+` is read left to
 * right in both locales, and letting it inherit `rtl` moves the country code to the wrong end.
 *
 * Until this file nothing held it. `/contracts/[id]` drew the same number through a hand-rolled
 * span and rendered `966570493924+` in Arabic while the tenant record, the tenant directory and
 * the dashboard all rendered `+966570493924`. That was #810, and it was found by reading a screen
 * rather than by a gate.
 *
 * **What a test can reach here, and what it cannot.** jsdom lays nothing out, so the order the
 * glyphs appear in is not observable and no assertion can watch the country code move. The
 * mechanism is what is reachable: the element states its own direction instead of inheriting the
 * surrounding one, and stating it is the whole of what keeps the `+` at the front. So the subject
 * is rendered under an ancestor that is `rtl` and would otherwise supply the direction, and what
 * is asserted is that it does not take it.
 */

const NUMBER = '+966570493924';

// the direction an Arabic screen puts above every cell. `@testing-library/svelte` appends its own
// container to the body and ignores one passed in, so the body is where an ancestor direction has
// to go.
function renderUnderRtl() {
	document.body.dir = 'rtl';

	return render(Cell.Phone, { phone: NUMBER });
}

afterEach(() => {
	document.body.dir = '';
});

test('a phone number under rtl states its own direction rather than inheriting one', () => {
	const { container } = renderUnderRtl();
	const rendered = container.querySelector('span');

	expect(rendered?.dir).toBe('ltr');
	expect(rendered?.textContent).toBe(NUMBER);
});

test('the direction it would otherwise have inherited is the wrong one', () => {
	const { container } = renderUnderRtl();
	const rendered = container.querySelector('span');

	// spelled out so the assertion above reads as what it is. Without `dir` of its own the number
	// resolves to this, which is the render that put the country code last on the contract record.
	expect(rendered?.parentElement?.closest('[dir]')).toBe(document.body);
	expect(document.body.dir).toBe('rtl');
});
