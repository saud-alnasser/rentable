import ExportDialog from '#lib/block/export-dialog.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * Which file a list becomes, and the one capability this block is handed.
 *
 * **`onExport` is the injection, and the last two tests are what make it a seam rather than a
 * hole.** The package can compose a file and cannot put it anywhere, so writing is the consumer's
 * and arrives as this prop; a test that only rendered the dialog would pass against a control
 * wired to nothing. So the format the reader chose is asserted at the far side of the call, both
 * for the default and for the one they had to press for.
 *
 * Five contract keys are read here, which is more than any other block but the delete and
 * selection dialogs. Each assertion is anchored to the element that should carry the word: the
 * two format rows are alike enough that a search of the whole document would pass with the labels
 * on the wrong ones, and the footer's two controls are in the order the reader meets them.
 */
const show = (props: Record<string, unknown> = {}, strings: Partial<DesignStrings> = {}) =>
	render(
		ExportDialog,
		{ open: true, onOpenChange: () => {}, onExport: () => {}, ...props },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
		}
	);

const formats = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-pressed]'));

const footer = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

const title = () => document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim();

const description = () =>
	document.querySelector('[data-slot="dialog-description"]')?.textContent?.trim();

test('the dialog is titled and asked in the words the contract supplied', () => {
	show({}, { export: 'تصدير', exportDescription: 'أي ملف يصبح هذا؟' });

	expect(title()).toBe('تصدير');
	expect(description()).toBe('أي ملف يصبح هذا؟');
});

test('each format is named by its own key, in the order the two are offered', () => {
	show({}, { formatCsv: 'ملف نصي', formatXlsx: 'مصنف إكسل' });

	expect(formats()[0]?.textContent).toContain('ملف نصي');
	expect(formats()[1]?.textContent).toContain('مصنف إكسل');
});

test('leaving and confirming are worded by the contract, and confirming changes word while it writes', () => {
	show({ isExporting: true }, { cancel: 'إلغاء', export: 'تصدير', working: 'يعمل...' });

	expect(footer()[0]?.textContent?.trim()).toBe('إلغاء');
	// the confirming control, which says what it is doing rather than what it would do
	expect(footer()[1]?.textContent?.trim()).toBe('يعمل...');
});

test('the injected capability is called with the format the dialog opens on', async () => {
	const asked: string[] = [];

	show({ onExport: (format: string) => void asked.push(format) });
	footer()[1]?.click();
	await Promise.resolve();

	expect(asked).toEqual(['csv']);
});

test('the injected capability is called with the format the reader chose instead', async () => {
	const asked: string[] = [];

	show({ onExport: (format: string) => void asked.push(format) });
	formats()[1]?.click();
	footer()[1]?.click();
	await Promise.resolve();

	expect(asked).toEqual(['xlsx']);
});
