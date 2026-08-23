import { recordCard } from '#lib/block/record-card.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import RecordCardHarness from '#tests/record-card-harness.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import PencilIcon from '@lucide/svelte/icons/pencil';
import { expect, test } from 'vitest';

/**
 * The card a record wears in a list, and the treatment it wears it with.
 *
 * **The treatment is the reason this file exists at all.** `recordCard` was declared by the list
 * block until #782 and is declared here now, so what the two tests below defend is that the class
 * list reaches the element a reader presses rather than a wrapper around it. The failure it
 * replaces is a card that still renders and no longer lifts, which nothing else here would see.
 *
 * The card takes a snippet, so it is rendered through a fixture; everything the tests drive is a
 * prop on that fixture. `openMenu` is the one contract read, and it is on a control that only
 * appears where the card has actions, which is why the two menu tests pass actions and the
 * treatment test does not.
 */
const show = (props: Record<string, unknown> = {}, strings: Partial<DesignStrings> = {}) =>
	render(RecordCardHarness, props, {
		wrapper: DesignProvider,
		wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
	});

const action = { label: 'عدل', icon: PencilIcon, onSelect: () => {} };

const link = () => document.querySelector('a');

test('the treatment is on the element the link covers, not on a wrapper around it', () => {
	show();

	const surface = link()?.parentElement;

	// every class the treatment declares, on the one element that carries the anchor. Asserted as
	// the whole list rather than as a sample, because a treatment half-applied still renders.
	for (const painted of recordCard.split(' ')) {
		expect(surface?.classList.contains(painted)).toBe(true);
	}
});

test('the quiet control that opens the actions is named by the string the contract supplied', () => {
	show({ actions: [action] }, { openMenu: 'افتح القائمة' });

	expect(document.querySelector('.sr-only')?.textContent).toBe('افتح القائمة');
});

test('a card with nothing to offer claims neither route, so there is no control to name', () => {
	show({ actions: [] }, { openMenu: 'افتح القائمة' });

	expect(document.querySelector('.sr-only')).toBe(null);
	expect(document.body.textContent).not.toContain('افتح القائمة');
});
