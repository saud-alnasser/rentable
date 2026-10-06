import PasswordInput from '#lib/block/password-input.svelte';
import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import PasswordInputHarness from '#tests/password-input-harness.svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

/**
 * A password field shows what was typed for exactly as long as its eye is held (effort 851,
 * requirements 19 to 21, criteria 19 to 21).
 *
 * The eye's name is the string contract's `showPassword`, which the harness supplies. The
 * events are fired by hand, since the repository has no user-event, and a release is fired on the
 * window, where a pointer let go outside the eye lands.
 */
const field = () => document.querySelector<HTMLInputElement>('#harness-password')!;
const eye = () => screen.getByRole('button', { name: 'show password' });

/** the glyph drawn now: the one of the two that is not faded out. */
const glyph = () =>
	[...document.querySelectorAll<SVGElement>('[data-password-eye-glyph]')].find((icon) =>
		icon.classList.contains('opacity-100')
	)!;

/** lets the microtask that puts the caret back run. */
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test('at rest it draws dots and a closed eye at the trailing end', () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	expect(field().type).toBe('password');
	expect(glyph().classList.contains('lucide-eye-closed')).toBe(true);
	expect(eye().getAttribute('type')).toBe('button');
	expect(eye().closest('[data-slot=input-group-addon]')?.getAttribute('data-align')).toBe(
		'inline-end'
	);
});

test('holding the eye shows the characters and opens it; releasing on the window hides them', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	await fireEvent.pointerDown(eye(), { button: 0 });
	expect(field().type).toBe('text');
	expect(glyph().classList.contains('lucide-eye')).toBe(true);
	expect(eye().dataset.passwordEye).toBe('open');

	await fireEvent.pointerUp(window);
	expect(field().type).toBe('password');
	expect(glyph().classList.contains('lucide-eye-closed')).toBe(true);
});

test('a cancelled press hides it again', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	await fireEvent.pointerDown(eye(), { button: 0 });
	await fireEvent.pointerCancel(window);
	expect(field().type).toBe('password');
});

test('the window losing focus hides it again', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	await fireEvent.pointerDown(eye(), { button: 0 });
	await fireEvent.blur(window);
	expect(field().type).toBe('password');
});

test('the press is held off its default, so focus is not taken from the field', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	expect(await fireEvent.pointerDown(eye(), { button: 0 })).toBe(false);
	expect(await fireEvent.mouseDown(eye(), { button: 0 })).toBe(false);
});

test('Space held on the eye shows the characters, and its release hides them', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });
	eye().focus();

	await fireEvent.keyDown(eye(), { key: ' ' });
	expect(field().type).toBe('text');
	expect(glyph().classList.contains('lucide-eye')).toBe(true);

	// a held key repeats, and a repeat changes nothing.
	await fireEvent.keyDown(eye(), { key: ' ', repeat: true });
	expect(field().type).toBe('text');

	await fireEvent.keyUp(eye(), { key: ' ' });
	expect(field().type).toBe('password');
	expect(document.activeElement).toBe(eye());
});

test('the eye losing focus while Space is held hides it again', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });
	eye().focus();

	await fireEvent.keyDown(eye(), { key: ' ' });
	await fireEvent.blur(eye());
	expect(field().type).toBe('password');
});

test('the eye is reached by Tab after the field and is not the form default button', async () => {
	const onsubmit = vi.fn();
	render(PasswordInputHarness, { value: 'correct horse', onsubmit });

	// the eye follows the field in the tab order, and nothing takes it out of it.
	const focusable = [...document.querySelectorAll<HTMLElement>('input, button')];
	expect(focusable.indexOf(eye())).toBe(focusable.indexOf(field()) + 1);
	expect(eye().tabIndex).toBe(0);

	// Enter in the field is left to the browser, which submits through the form's default button:
	// the first submit button in it. jsdom implements no implicit submission, so the test does what
	// the browser does with the button it would find.
	expect(await fireEvent.keyDown(field(), { key: 'Enter' })).toBe(true);
	const fallback = field().form!.querySelector<HTMLButtonElement>(
		'button:not([type]), button[type=submit]'
	)!;
	expect(fallback).not.toBe(eye());
	await fireEvent.click(fallback);
	expect(onsubmit).toHaveBeenCalledOnce();
});

test('a pointer hold leaves the value and the caret, and focus in the field', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });
	field().focus();
	field().setSelectionRange(3, 3);

	await fireEvent.pointerDown(eye(), { button: 0 });
	await settle();
	expect(field().value).toBe('correct horse');
	expect([field().selectionStart, field().selectionEnd]).toEqual([3, 3]);

	await fireEvent.pointerUp(window);
	await settle();
	expect(field().value).toBe('correct horse');
	expect([field().selectionStart, field().selectionEnd]).toEqual([3, 3]);
	expect(document.activeElement).toBe(field());
});

test('a pointer hold puts focus in the field even where it was elsewhere', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	await fireEvent.pointerDown(eye(), { button: 0 });
	await fireEvent.pointerUp(window);
	expect(document.activeElement).toBe(field());
});

test('a Space hold leaves the value and the caret', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });
	field().setSelectionRange(5, 7);
	eye().focus();

	await fireEvent.keyDown(eye(), { key: ' ' });
	await fireEvent.keyUp(eye(), { key: ' ' });
	await settle();
	expect(field().value).toBe('correct horse');
	expect([field().selectionStart, field().selectionEnd]).toEqual([5, 7]);
});

test('a disabled field has a disabled eye, which shows nothing', async () => {
	render(PasswordInputHarness, { value: 'correct horse', disabled: true });

	expect(field().disabled).toBe(true);
	expect(eye().hasAttribute('disabled')).toBe(true);
	expect(field().closest('[data-slot=input-group]')?.getAttribute('data-disabled')).toBe('true');

	await fireEvent.pointerDown(eye(), { button: 0 });
	expect(field().type).toBe('password');
});

test('only the primary button holds it', async () => {
	render(PasswordInputHarness, { value: 'correct horse' });

	await fireEvent.pointerDown(eye(), { button: 2 });
	expect(field().type).toBe('password');
});

test("the eye is named by the contract, in the reader's language", () => {
	render(PasswordInputHarness, { value: 'correct horse', dir: 'rtl', name: 'أظهر كلمة المرور' });

	expect(field().closest('[data-password-input]')?.querySelector('[data-password-eye]')).toBe(
		screen.getByRole('button', { name: 'أظهر كلمة المرور' })
	);
});

test('in Arabic the eye is the group last child, so it sits at the left end', () => {
	render(PasswordInputHarness, { value: 'correct horse', dir: 'rtl' });

	const group = field().closest('[data-slot=input-group]')!;
	expect(group.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
	expect(group.lastElementChild?.contains(eye())).toBe(true);
	expect(group.lastElementChild?.getAttribute('data-align')).toBe('inline-end');
});

test('with lead it starts with the key, and the rest goes to the input', () => {
	render(PasswordInputHarness, { value: 'correct horse', lead: true });

	const group = field().closest('[data-slot=input-group]')!;
	expect(group.firstElementChild?.querySelector('.lucide-key-round')).not.toBeNull();
	expect(field().name).toBe('password');
	expect(field().autocomplete).toBe('current-password');
	expect(group.classList.contains('h-9')).toBe(true);
});

test('without lead it draws no key, and the caller reads the input through ref', () => {
	let ref: HTMLInputElement | null = null;
	render(
		PasswordInput,
		{
			get ref() {
				return ref;
			},
			set ref(element: HTMLInputElement | null) {
				ref = element;
			},
			'aria-invalid': 'true'
		},
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings(), direction: 'ltr' } }
	);

	expect(document.querySelector('.lucide-key-round')).toBeNull();
	expect(ref).toBe(document.querySelector('input'));
	expect(document.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
});
