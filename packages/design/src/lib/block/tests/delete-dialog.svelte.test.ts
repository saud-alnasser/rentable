import DeleteDialog from '#lib/block/delete-dialog.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import { TRPCError } from '@trpc/server';
import { tick } from 'svelte';
import { expect, test } from 'vitest';

/**
 * The block with the most contract reads in the package: eight keys, three of them behind a prop
 * default and five rendered in the body. `delete` is two of the four defaults, which is why the
 * two figures do not add up to eight twice.
 *
 * **Four of the words this surface renders are the caller's wherever the caller supplies one**,
 * and a test that renders only the defaults cannot see the difference: replace all four defaults
 * with the contract strings they fall back to and every assertion still holds, because the props
 * were never passed. So both directions are rendered below, and the two overriding tests are what
 * make the defaulting ones mean anything.
 *
 * **Every assertion below is anchored to the element that should carry the word**, because the
 * dialog renders two paragraphs and two controls that are alike enough for a search of the whole
 * document to pass while the words are on the wrong ones. The record leads and the description
 * follows, so `paragraphs()[0]` and `[1]` are those two in the order the reader meets them; the
 * leaving control precedes the destructive one in the footer for the same reason.
 *
 * There is no fixture. The subject takes its own props and needs nothing above it but the
 * provider, which `wrapper` supplies.
 */
const open = (props: Record<string, unknown>, strings: Partial<DesignStrings> = {}) =>
	render(
		DeleteDialog,
		{ open: true, onOpenChange: () => {}, onSubmit: () => {}, ...props },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
		}
	);

const paragraphs = () => Array.from(document.querySelectorAll('[data-slot="dialog-content"] p'));

const footer = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

const title = () => document.querySelector('[data-slot="dialog-title"]')?.textContent;

test('the title and both controls are named by the strings the contract supplied', () => {
	open({ record: 'الوحدة أ' }, { delete: 'حذف', cancel: 'إلغاء' });

	expect(title()).toBe('حذف');
	expect(footer()[0]?.textContent?.trim()).toBe('إلغاء');
	expect(footer()[1]?.textContent?.trim()).toBe('حذف');
});

test('what it costs is the contract sentence, on the line under the record', () => {
	open({ record: 'الوحدة أ' }, { deleteDescription: 'يمكنك التراجع عن هذا' });

	expect(paragraphs()[0]?.textContent?.trim()).toBe('الوحدة أ');
	expect(paragraphs()[1]?.textContent?.trim()).toBe('يمكنك التراجع عن هذا');
});

test('a record the surface did not name is called what the contract calls an unnamed one', () => {
	open({}, { unnamedRecord: 'هذا السجل' });

	expect(paragraphs()[0]?.textContent?.trim()).toBe('هذا السجل');
});

test('a blocked deletion swaps the cost sentence for the blocked one, and cancel for close', () => {
	open(
		{ record: 'الوحدة أ', blockers: ['عقد واحد'] },
		{
			deleteDescription: 'يمكنك التراجع عن هذا',
			deleteBlockedDescription: 'لا يمكن حذف هذا',
			close: 'إغلاق',
			cancel: 'إلغاء'
		}
	);

	expect(paragraphs()[1]?.textContent?.trim()).toBe('لا يمكن حذف هذا');
	// the destructive control is not withheld and renamed, it is not rendered at all.
	expect(footer()).toHaveLength(1);
	expect(footer()[0]?.textContent?.trim()).toBe('إغلاق');
});

test('a caller that words the surface itself is not overruled by the contract', () => {
	open(
		{
			record: 'الوحدة أ',
			title: 'إنهاء العقد',
			description: 'ينتهي العقد اليوم',
			confirmLabel: 'إنهاء'
		},
		{ delete: 'حذف', deleteDescription: 'يمكنك التراجع عن هذا' }
	);

	expect(title()).toBe('إنهاء العقد');
	expect(paragraphs()[1]?.textContent?.trim()).toBe('ينتهي العقد اليوم');
	expect(footer()[1]?.textContent?.trim()).toBe('إنهاء');
});

test('a caller that supplies an in-flight word keeps it', async () => {
	open(
		{
			record: 'الوحدة أ',
			onSubmit: () => new Promise<void>(() => {}),
			confirmLabel: 'إنهاء',
			confirmLoadingLabel: 'جارٍ الإنهاء...'
		},
		{ delete: 'حذف', deleting: 'جارٍ الحذف...' }
	);

	footer()[1]?.click();
	await tick();

	expect(footer()[1]?.textContent?.trim()).toBe('جارٍ الإنهاء...');
});

test('a failure with no words of its own is reported in the contract sentence', async () => {
	open(
		{
			record: 'الوحدة أ',
			// BAD_REQUEST with nothing to say is the one failure the surface has to word itself.
			onSubmit: () => Promise.reject(new TRPCError({ code: 'BAD_REQUEST', message: '' }))
		},
		{ unexpectedError: 'حدث خطأ غير متوقع' }
	);

	footer()[1]?.click();
	await tick();
	await tick();

	// the callout carries no `data-slot`, alone among the primitives on this surface, so what
	// identifies it is the shape it is drawn as. Raised as #796 rather than added here.
	expect(
		document
			.querySelector('[data-slot="dialog-content"] div.rounded-md.border')
			?.textContent?.trim()
	).toBe('حدث خطأ غير متوقع');
});

test('the destructive control takes the in-flight word while the handler runs', async () => {
	open(
		// a promise that never settles is what leaves the control in the state under test.
		{ record: 'الوحدة أ', onSubmit: () => new Promise<void>(() => {}) },
		{ delete: 'حذف', deleting: 'جارٍ الحذف...' }
	);

	expect(footer()[1]?.textContent?.trim()).toBe('حذف');

	footer()[1]?.click();
	await tick();

	expect(footer()[1]?.textContent?.trim()).toBe('جارٍ الحذف...');
});
