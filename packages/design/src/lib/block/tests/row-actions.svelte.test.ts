import type { RecordCardAction } from '#lib/block/record-card.svelte';
import RowActions from '#lib/block/row-actions.svelte';
import Providers from '#tests/providers.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import { fireEvent, render } from '@testing-library/svelte';
import BanIcon from '@lucide/svelte/icons/ban';
import PencilIcon from '@lucide/svelte/icons/pencil';
import ShieldIcon from '@lucide/svelte/icons/shield';
import { expect, test } from 'vitest';

/**
 * The one control a row carries, and the menu it opens.
 *
 * **What the block is for is the grouping**, so that is what these read: the acts arrive as
 * groups and the reader meets a separator between them and nowhere else. A group that is empty on
 * this reader has to leave no trace at all, because a separator with nothing on one side of it is
 * the menu saying something was withheld.
 *
 * The subject takes props a `.ts` file can write, so there is no fixture, but it needs two
 * providers rather than one: it draws a tooltip, whose root reads `TooltipProvider`'s context, and
 * the menu's content reads `DesignProvider`'s. `#tests/providers.svelte` is that pair.
 *
 * The menu is opened by pressing the control, the way a reader opens it. `fireEvent.click` sends a
 * `MouseEvent` whose `detail` is 0, which is the branch bits-ui's trigger treats as a press rather
 * than as VoiceOver's synthetic click, so the portal opens under jsdom and nothing here has to
 * reach past the block's own props to get at it.
 */
const act = (label: string, overrides: Partial<RecordCardAction> = {}): RecordCardAction => ({
	label,
	icon: PencilIcon,
	onSelect: () => {},
	...overrides
});

const show = (groups: RecordCardAction[][], label = 'ما يمكنك فعله') =>
	render(
		RowActions,
		{ label, groups },
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

const trigger = () =>
	document.querySelector<HTMLButtonElement>('[data-slot=dropdown-menu-trigger]');

const open = async () => {
	await fireEvent.click(trigger()!);
};

const items = () =>
	Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).map((item) =>
		item.textContent?.trim()
	);

const separators = () => document.querySelectorAll('[data-slot=dropdown-menu-separator]').length;

test('the control is named for a pointer and for a screen reader by the one label', () => {
	show([[act('عدل')]]);

	expect(trigger()?.getAttribute('aria-label')).toBe('ما يمكنك فعله');
	expect(trigger()?.querySelector('.sr-only')?.textContent).toBe('ما يمكنك فعله');
	// the third reading is the tooltip, and it is the one an assertion cannot reach here:
	// `Tooltip.Content` is instantiated by bits-ui when the tooltip opens, the limit
	// `back-control.svelte.test.ts` names. What is checkable is that this control is the trigger
	// the content would hang off, and that the words it is named by are the caller's one label.
	expect(trigger()?.hasAttribute('data-tooltip-trigger')).toBe(true);
});

test('the acts read in the order they were handed over, with one separator between groups', async () => {
	show([[act('عدل')], [act('الدور'), act('الوصول')], [act('أزل')]]);

	await open();

	expect(items()).toEqual(['عدل', 'الدور', 'الوصول', 'أزل']);
	expect(separators()).toBe(2);
});

test('a group this reader holds nothing in draws neither an item nor a separator', async () => {
	show([[act('عدل')], [], [act('أزل')]]);

	await open();

	expect(items()).toEqual(['عدل', 'أزل']);
	expect(separators()).toBe(1);
});

test('one group is a menu with no separator at all, and every group empty is no control', async () => {
	const one = show([[act('عدل')], []]);

	await open();

	expect(items()).toEqual(['عدل']);
	expect(separators()).toBe(0);
	one.unmount();

	// a row with nothing to offer offers no route to it: an empty menu promises acts that are not
	// there, and a control that opens onto nothing is worse than no control.
	show([[], []]);

	expect(trigger()).toBeNull();
});

test('an act that destroys something says so, and one already running cannot be pressed again', async () => {
	show([
		[act('عدل', { attributes: { 'data-row-rename': 'ada' } })],
		[
			act('أزل', { variant: 'destructive', icon: BanIcon }),
			act('احظر', { variant: 'destructive', icon: ShieldIcon, disabled: true })
		]
	]);

	await open();

	const drawn = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]'));

	expect(drawn[0]?.getAttribute('data-variant')).toBe('default');
	expect(drawn[1]?.getAttribute('data-variant')).toBe('destructive');
	expect(drawn[2]?.getAttribute('data-variant')).toBe('destructive');
	expect(drawn[2]?.getAttribute('data-disabled')).not.toBeNull();
	// what the surface marks an entry with reaches the entry, which is how a list is read here.
	expect(drawn[0]?.getAttribute('data-row-rename')).toBe('ada');
});

test('pressing an act selects it, and the caller is told which', async () => {
	const chosen: string[] = [];

	show([[act('عدل', { onSelect: () => chosen.push('عدل') })], [act('أزل')]]);

	await open();
	await fireEvent.click(document.querySelectorAll('[data-slot=dropdown-menu-item]')[0]!);

	expect(chosen).toEqual(['عدل']);
});
