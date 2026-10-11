import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import FormSurfaceHarness from '#tests/form-surface-harness.svelte';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

/**
 * The one block that reads both halves of the contract.
 *
 * Its panel is `bits-ui`'s own content rather than the dialog primitive's, and it is portalled
 * to `document.body`, so the direction it renders in is the one it states and never one it
 * inherits: a form that dropped the read would look correct in a left-to-right consumer and
 * wrong in every other, with nothing to report it. That is the whole reason both directions are
 * asserted rather than one.
 */
const surface = () => document.querySelector('[data-slot="form-surface"]');

test('the portalled panel renders in the direction the contract supplied', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

	expect(surface()?.getAttribute('dir')).toBe('rtl');
});

test('the same panel follows the consumer into the other direction', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
		}
	);

	expect(surface()?.getAttribute('dir')).toBe('ltr');
});

test('the corner close control is named by the string the contract supplied', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ close: 'إغلاق' }), direction: 'rtl' }
		}
	);

	expect(document.querySelector('[data-slot="dialog-close"] span')?.textContent).toBe('إغلاق');
});

/**
 * A form with changes asks before it closes ([[rules/interface]], *Form surface*).
 *
 * Four ways close a form without submitting it, and each is driven here the way the reader
 * drives it: Escape, a press on the overlay, the corner control, and the form's own cancel,
 * which reaches the surface through the `requestClose` it hands the actions. Each is asserted
 * twice, because the defect on either side is silent: a dirty form that closes loses what was
 * typed, and a clean form that asks puts a question in front of every close.
 *
 * The question's words are the contract's, supplied here as words no default could produce.
 */
const discardWords = {
	discardChangesTitle: 'تجاهل التغييرات؟',
	discardChangesDescription: 'لم تُحفظ تغييراتك بعد',
	discard: 'تجاهل',
	keepEditing: 'متابعة التعديل'
};

const openForm = (dirty: boolean) => {
	const onOpenChange = vi.fn();

	render(
		FormSurfaceHarness,
		{ dirty, onOpenChange },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(discardWords), direction: 'rtl' }
		}
	);

	return onOpenChange;
};

const question = () => document.querySelector('[data-confirm-dialog]');

const questionButtons = () =>
	Array.from(
		question()?.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button') ?? []
	);

const keepEditing = () =>
	questionButtons().find((button) => button.textContent?.trim() === discardWords.keepEditing);

const discard = () =>
	questionButtons().find((button) => button.textContent?.trim() === discardWords.discard);

const field = () => document.querySelector<HTMLInputElement>('[data-field]')!;

// what bits-ui focuses when a dialog opens is the first tabbable control inside it, found by the
// `tabbable` library, which reads layout. jsdom lays nothing out, so there that lookup finds
// nothing and bits-ui focuses the panel instead; what is pinned here is the order it reads in a
// window that does lay out. A link, a field or a control without `tabindex="-1"`.
const firstTabbable = (within: Element | null) =>
	within?.querySelector<HTMLElement>(
		'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
	);

// bits-ui registers its outside-press listener a millisecond after the panel opens and settles
// the press after a ten millisecond debounce, so the press waits for the one and the test for
// the other. jsdom lays nothing out, so every rect is empty and any point is outside it.
const pressOverlay = async () => {
	await new Promise((resolve) => setTimeout(resolve, 5));
	await fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]')!, {
		clientX: 10,
		clientY: 10,
		button: 0
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
};

const closes = {
	escape: async () => {
		field().focus();
		await fireEvent.keyDown(field(), { key: 'Escape' });
	},
	'a press on the overlay': pressOverlay,
	'the corner control': async () => {
		await fireEvent.click(
			document.querySelector<HTMLButtonElement>(
				'[data-slot="form-surface"] [data-slot="dialog-close"]'
			)!
		);
	},
	'the cancel button': async () => {
		await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-cancel]')!);
	}
} as const;

for (const [name, close] of Object.entries(closes)) {
	test(`${name} asks before closing a form with changes`, async () => {
		const onOpenChange = openForm(true);

		await close();

		await waitFor(() => expect(question()).not.toBeNull());
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(surface()).not.toBeNull();
	});

	test(`${name} closes a form with no changes at once`, async () => {
		const onOpenChange = openForm(false);

		await close();

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(question()).toBeNull();
	});
}

test("the question is the contract's, destructive, with keep editing focused first", async () => {
	openForm(true);

	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-cancel]')!);

	await waitFor(() => expect(question()).not.toBeNull());
	expect(question()?.querySelector('[data-slot="dialog-title"]')?.textContent).toBe(
		discardWords.discardChangesTitle
	);
	expect(question()?.textContent).toContain(discardWords.discardChangesDescription);
	expect(discard()?.classList).toContain('bg-destructive-fill');
	expect(keepEditing()?.classList).not.toContain('bg-destructive-fill');
	expect(firstTabbable(question())).toBe(keepEditing());
	await waitFor(() => expect(question()?.contains(document.activeElement)).toBe(true));
});

test('keep editing keeps the form open, with focus inside it', async () => {
	const onOpenChange = openForm(true);

	field().focus();
	await fireEvent.keyDown(field(), { key: 'Escape' });
	await waitFor(() => expect(keepEditing()).toBeDefined());

	await fireEvent.click(keepEditing()!);

	await waitFor(() => expect(question()).toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
	expect(surface()).not.toBeNull();
	await waitFor(() => expect(surface()?.contains(document.activeElement)).toBe(true));
});

test('discard closes the form', async () => {
	const onOpenChange = openForm(true);

	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-cancel]')!);
	await waitFor(() => expect(discard()).toBeDefined());

	await fireEvent.click(discard()!);

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	await waitFor(() => expect(question()).toBeNull());
});

test('Escape inside the question closes only the question', async () => {
	const onOpenChange = openForm(true);

	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-cancel]')!);
	await waitFor(() => expect(question()?.contains(document.activeElement)).toBe(true));

	await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

	await waitFor(() => expect(question()).toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
	expect(surface()).not.toBeNull();
});

test('a submit closes a form with changes through its own path, and never asks', async () => {
	openForm(true);

	await fireEvent.submit(
		document.querySelector<HTMLFormElement>('[data-slot="form-surface"] form')!
	);

	await waitFor(() => expect(surface()).toBeNull());
	expect(question()).toBeNull();
});
