import { recordCard } from '#lib/block/record-card.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import RecordCardHarness from '#tests/record-card-harness.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import { fireEvent, render } from '@testing-library/svelte';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import { expect, test, vi } from 'vitest';

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
 *
 * **The two optional fields of `RecordCardAction` are read on both routes.** `disabled` and
 * `attributes` arrived on the shared type for the rows, and a card cannot offer one thing to the
 * quiet control and another to the context gesture, so each is asserted on the menu the control
 * opens and on the menu the gesture opens. Both menus are portalled, so what is queried is the
 * document rather than the render's container.
 */
const show = (props: Record<string, unknown> = {}, strings: Partial<DesignStrings> = {}) =>
	render(RecordCardHarness, props, {
		wrapper: DesignProvider,
		wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
	});

const action = { label: 'عدل', icon: SquarePenIcon, onSelect: () => {} };

const link = () => document.querySelector('a');

/** the quiet control a card with actions carries. */
const control = () => document.querySelector<HTMLButtonElement>('button');

/** open the control's menu and hand back the entries in it. */
const throughTheControl = async () => {
	await fireEvent.click(control()!);

	return [...document.querySelectorAll('[data-slot=dropdown-menu-item]')];
};

/** open the platform's context gesture on the card and hand back the entries in it. */
const throughTheGesture = async () => {
	await fireEvent.contextMenu(link()!.parentElement!);

	return [...document.querySelectorAll('[data-slot=context-menu-item]')];
};

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

// `disabled` is the act already running, which is the state a menu cannot show by hiding the
// entry: an act that vanishes mid-press reads as an act that was never there. So it is drawn and
// marked rather than dropped, and it is marked the same way on both routes.
test('an act already running is drawn on both routes and marked as not pressable', async () => {
	const onSelect = vi.fn();

	show({ actions: [{ ...action, disabled: true, onSelect }] });

	const [fromControl] = await throughTheControl();

	expect(fromControl?.getAttribute('aria-disabled')).toBe('true');
	expect(fromControl?.textContent).toContain(action.label);

	const [fromGesture] = await throughTheGesture();

	expect(fromGesture?.getAttribute('aria-disabled')).toBe('true');

	// and neither route lets it fire while it is in that state.
	await fireEvent.click(fromGesture!);

	expect(onSelect).not.toHaveBeenCalled();
});

// an act with nothing to say about itself is pressable, which is the other half of the same read:
// the mark above comes from the prop and not from something the card does to every entry.
test('an act that is not marked is pressable, and the gesture fires it', async () => {
	const onSelect = vi.fn();

	show({ actions: [{ ...action, onSelect }] });

	const [entry] = await throughTheGesture();

	expect(entry?.getAttribute('aria-disabled')).not.toBe('true');

	await fireEvent.click(entry!);

	expect(onSelect).toHaveBeenCalledTimes(1);
});

// `attributes` is what the surface marks the entry with, the `data-*` every list here is read by,
// and it is the caller's because the act it stands for is. It reaches the entry verbatim on both
// routes, which is what lets one test read the same act through either.
test('what the caller marks an act with reaches the entry on both routes', async () => {
	show({
		actions: [{ ...action, attributes: { 'data-workspace-rename': 'ws-1', 'data-kind': 'edit' } }]
	});

	const [fromControl] = await throughTheControl();

	expect(fromControl?.getAttribute('data-workspace-rename')).toBe('ws-1');
	expect(fromControl?.getAttribute('data-kind')).toBe('edit');

	const [fromGesture] = await throughTheGesture();

	expect(fromGesture?.getAttribute('data-workspace-rename')).toBe('ws-1');
	expect(fromGesture?.getAttribute('data-kind')).toBe('edit');
});

// moving through a list from the keyboard lands focus on each card's link in turn, many times a
// minute, so arriving there must not animate: the link carries no transition, and nothing the card
// itself transitions is answered by focus. The lift answers the pointer alone.
test('keyboard focus arriving on a card animates nothing', () => {
	show();

	const surface = link()?.parentElement;
	const classes = [...(surface?.classList ?? []), ...(link()?.classList ?? [])];

	expect([...(link()?.classList ?? [])].filter((token) => /transition/.test(token))).toEqual([]);
	expect(
		classes.filter((token) => /(^|:)focus[\w-]*:.*(translate|scale|shadow)/.test(token))
	).toEqual([]);
});

// requirement 3 of effort 832, criterion 3(b): a menu's rows carry icons on every row or on none.
// The card's type makes the icon required, so what this defends is that both routes draw it, and
// draw it first, which is what lines the rows up down the menu.
test('every entry on both routes leads with its icon', async () => {
	show({
		actions: [
			action,
			{ label: 'احذف', icon: Trash2Icon, variant: 'destructive', onSelect: () => {} }
		]
	});

	const leads = (entry: Element) => entry.firstElementChild?.tagName.toLowerCase() === 'svg';

	const throughControl = await throughTheControl();
	expect(throughControl).toHaveLength(2);
	expect(throughControl.every(leads)).toBe(true);

	await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

	const throughGesture = await throughTheGesture();
	expect(throughGesture).toHaveLength(2);
	expect(throughGesture.every(leads)).toBe(true);
});
