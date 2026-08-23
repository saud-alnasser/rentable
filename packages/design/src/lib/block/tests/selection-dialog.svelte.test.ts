import SelectionDialog from '#lib/block/selection-dialog.svelte';
import type { SelectionPlan } from '#lib/selection.js';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { TRPCError } from '@trpc/server';
import { expect, test } from 'vitest';

/**
 * The block with the second most contract reads, and the only one anywhere that reads a key
 * taking an argument.
 *
 * **What the caller words and what the contract words are deliberately different here**, and the
 * tests keep them apart: `summarize` and `describeReason` are props because a reason is the
 * concept's own sentence, while the count of the records this dialog chose not to list is the
 * dialog's own arithmetic and so is the contract's. A test that read the whole document could
 * not tell the two apart, so every line below is anchored to the element that should carry it,
 * and **both prop-worded lines are asserted as well as the contract-worded one**. Swap either
 * prop's output for a contract string and a test fails, which is the whole of what this file
 * defends.
 */
const named = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		id: `r${index}`,
		name: `سجل ${index}`,
		reason: 'held'
	}));

// a refusal the surface has no name for. It is counted in the reason above the line and left out
// of the line itself, which is the one difference `moreRecords` is handed and the one a fixture
// of uniformly named records cannot show.
const anonymous = { id: 'anon', name: '', reason: 'held' };

const show = (plan: SelectionPlan | null, strings: Partial<DesignStrings> = {}) =>
	render(
		SelectionDialog,
		{
			open: true,
			onOpenChange: () => {},
			onSubmit: () => {},
			title: 'حذف المحدد',
			selected: 'ثلاثة سجلات',
			plan,
			reasons: ['held'],
			describeReason: (_reason: string, count: number) => `${count} مرفوض`,
			summarize: (count: number) => `${count} سيمضي`,
			confirmLabel: 'حذف',
			confirmLoadingLabel: 'جارٍ الحذف...'
		},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
		}
	);

const footer = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

// the line that names a handful of the refused records and then counts the rest. `ps-6` is what
// distinguishes it from the reason above it in the same group; a block adds no attribute of its
// own for a test to hold on to.
const namesLine = () => document.querySelector('[data-slot="dialog-content"] p.ps-6')?.textContent;

// the tally at the top of the panel and the reason above each names line, both of them worded by
// the caller. Neither carries an attribute of its own either, for the reason above.
const tallyLine = () =>
	document.querySelector('[data-slot="dialog-content"] p.min-w-0.text-sm')?.textContent;

const reasonLine = () =>
	document.querySelector('[data-slot="dialog-content"] p.items-start')?.textContent;

test('the records it had no room to name are counted by the contract function', () => {
	show({ eligible: ['a', 'b'], refused: named(6) }, { moreRecords: (count) => `و${count} غيرها` });

	expect(namesLine()?.trim()).toBe('سجل 0, سجل 1, سجل 2, سجل 3, و2 غيرها');
});

test('a plan with nothing left over names every record and calls the function for none', () => {
	show({ eligible: ['a'], refused: named(3) }, { moreRecords: (count) => `و${count} غيرها` });

	expect(namesLine()?.trim()).toBe('سجل 0, سجل 1, سجل 2');
});

test('the count is over the records it named, not over the records in the group', () => {
	// six refusals, five of them named. The line names four and counts one, because the one it has
	// no name for was never a candidate to be named; a count taken from the group would say two.
	show(
		{ eligible: ['a'], refused: [...named(5), anonymous] },
		{ moreRecords: (count) => `و${count} غيرها` }
	);

	expect(namesLine()?.trim()).toBe('سجل 0, سجل 1, سجل 2, سجل 3, و1 غيرها');
});

test('a group with an unnamed record in it can still have nothing left to count', () => {
	// five refusals, four of them named. `NAMED_RECORDS` is four, so nothing is left over and the
	// function is not called at all. This is the same difference as the test above, read from the
	// condition rather than from the argument.
	show(
		{ eligible: ['a'], refused: [...named(4), anonymous] },
		{ moreRecords: (count) => `و${count} غيرها` }
	);

	expect(namesLine()?.trim()).toBe('سجل 0, سجل 1, سجل 2, سجل 3');
});

test('the tally and the reason are worded by the caller, not by the contract', () => {
	show({ eligible: ['a', 'b'], refused: named(3) }, { nothingToDo: 'لا شيء مما اخترته' });

	expect(tallyLine()?.trim()).toBe('2 سيمضي');
	expect(reasonLine()?.trim()).toBe('3 مرفوض');
});

test('the leaving control is the contract cancel while there is something to confirm', () => {
	show({ eligible: ['a'], refused: [] }, { cancel: 'إلغاء', close: 'إغلاق' });

	expect(footer()[0]?.textContent?.trim()).toBe('إلغاء');
	expect(footer()[1]?.textContent?.trim()).toBe('حذف');
});

test('a plan that turned every record away says so, and leaves close as the only control', () => {
	show({ eligible: [], refused: named(2) }, { nothingToDo: 'لا شيء مما اخترته', close: 'إغلاق' });

	expect(
		document.querySelector('[data-slot="dialog-content"] p.border-t')?.textContent?.trim()
	).toBe('لا شيء مما اخترته');
	expect(footer()).toHaveLength(1);
	expect(footer()[0]?.textContent?.trim()).toBe('إغلاق');
});

test('a refusal with no words of its own is reported in the contract sentence', async () => {
	render(
		SelectionDialog,
		{
			open: true,
			onOpenChange: () => {},
			// BAD_REQUEST with nothing to say is the one failure the surface has to word itself.
			onSubmit: () => Promise.reject(new TRPCError({ code: 'BAD_REQUEST', message: '' })),
			title: 'حذف المحدد',
			selected: 'ثلاثة سجلات',
			plan: { eligible: ['a'], refused: [] } as SelectionPlan,
			reasons: ['held'],
			describeReason: (_reason: string, count: number) => `${count} مرفوض`,
			summarize: (count: number) => `${count} سيمضي`,
			confirmLabel: 'حذف',
			confirmLoadingLabel: 'جارٍ الحذف...'
		},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({ unexpectedError: 'حدث خطأ غير متوقع' }),
				direction: 'rtl'
			}
		}
	);

	footer()[1]?.click();
	await tick();
	await tick();

	// the callout is the one primitive on this surface with no `data-slot`, so what identifies
	// it is the shape it is drawn as. Raised as #796 rather than added here.
	expect(
		document
			.querySelector('[data-slot="dialog-content"] div.rounded-md.border')
			?.textContent?.trim()
	).toBe('حدث خطأ غير متوقع');
});
