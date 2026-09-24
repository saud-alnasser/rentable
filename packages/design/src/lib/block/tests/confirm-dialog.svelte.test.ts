import ConfirmDialog from '#lib/block/confirm-dialog.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import { TRPCError } from '@trpc/server';
import { tick } from 'svelte';
import { expect, test } from 'vitest';

/**
 * The confirm pattern for an act that is not a delete ([[rules/interface]], *Delete and confirm*):
 * titled and labelled with the act's own verb, never with the delete dialog's.
 *
 * **What is asserted is the absence of every delete word**, because the defect this block exists
 * to end was a terminate dialog that borrowed the delete dialog's shape and could fall back to its
 * words. The contract below supplies the delete words, and none of them may appear.
 *
 * There is no fixture, for the reason `delete-dialog.svelte.test.ts` gives.
 */
const open = (props: Record<string, unknown>, strings: Partial<DesignStrings> = {}) =>
	render(
		ConfirmDialog,
		{
			open: true,
			onOpenChange: () => {},
			onSubmit: () => {},
			title: 'إنهاء العقد',
			confirmLabel: 'إنهاء',
			confirmLoadingLabel: 'جارٍ الإنهاء...',
			...props
		},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({
					delete: 'حذف',
					deleting: 'جارٍ الحذف...',
					deleteDescription: 'لا يمكن التراجع عن هذا',
					...strings
				}),
				direction: 'rtl'
			}
		}
	);

const content = () => document.querySelector('[data-confirm-dialog]');

const paragraphs = () => Array.from(content()?.querySelectorAll('p') ?? []);

const footer = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

const title = () => document.querySelector('[data-slot="dialog-title"]')?.textContent;

test('the title and the confirming control are the act, and no delete word appears', () => {
	open({ record: 'عقد ٤٢', description: 'ينتهي العقد اليوم' }, { cancel: 'إلغاء' });

	expect(content()).not.toBeNull();
	expect(title()).toBe('إنهاء العقد');
	expect(footer()[0]?.textContent?.trim()).toBe('إلغاء');
	expect(footer()[1]?.textContent?.trim()).toBe('إنهاء');
	expect(content()?.textContent).not.toContain('حذف');
	expect(content()?.textContent).not.toContain('لا يمكن التراجع عن هذا');
});

test('the record leads and what the act does follows it', () => {
	open({ record: 'عقد ٤٢', description: 'ينتهي العقد اليوم' });

	expect(paragraphs()[0]?.textContent?.trim()).toBe('عقد ٤٢');
	expect(paragraphs()[1]?.textContent?.trim()).toBe('ينتهي العقد اليوم');
});

test('an act on no record says only what it does', () => {
	open({ description: 'تخرج الأجهزة الأخرى' });

	expect(paragraphs()).toHaveLength(1);
	expect(paragraphs()[0]?.textContent?.trim()).toBe('تخرج الأجهزة الأخرى');
});

test('an act that takes something away is the destructive control, one that gives back is not', () => {
	const { unmount } = open({});

	expect(footer()[1]?.classList).toContain('bg-destructive');
	unmount();

	open({ tone: 'neutral', title: 'استعادة العقد', confirmLabel: 'استعادة' });

	expect(footer()[1]?.classList).not.toContain('bg-destructive');
	expect(footer()[1]?.classList).toContain('bg-primary');
});

test('the confirming control takes the act in flight while the handler runs', async () => {
	open({ onSubmit: () => new Promise<void>(() => {}) });

	footer()[1]?.click();
	await tick();

	expect(footer()[1]?.textContent?.trim()).toBe('جارٍ الإنهاء...');
});

test('a refusal is shown inside the dialog, so the reader is still at the question', async () => {
	open({
		onSubmit: () => Promise.reject(new TRPCError({ code: 'BAD_REQUEST', message: 'مرفوض' }))
	});

	footer()[1]?.click();
	await tick();
	await tick();

	expect(content()?.querySelector('[data-slot="callout"]')?.textContent?.trim()).toBe('مرفوض');
});
