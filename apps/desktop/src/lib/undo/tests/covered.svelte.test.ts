import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { usesAppleKeyboard } from '@rentable/design/shortcut.js';

import type { Component } from 'svelte';

import PaletteHarness from '#tests/palette-harness.svelte';
import CoveredScreen from './covered-screen.svelte';

/**
 * UNDO AND REDO STAND DOWN UNDER A COVER
 *
 * Criterion 12 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]]: with a sheet open over
 * the page and a button inside it holding the focus, neither key moves the stack. The command
 * palette is not a cover: it is where the pair is asked for by name, so with only the palette
 * open both keys still move it.
 *
 * **What a move does is the mock.** The stack is reached through the shell, which this runner has
 * none of, so whether a key moved it is read from whether `applyUndo` or `applyRedo` was called.
 */

const { applyUndo, applyRedo } = vi.hoisted(() => ({
	applyUndo: vi.fn(async () => {}),
	applyRedo: vi.fn(async () => {})
}));

vi.mock('$lib/undo/move', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/undo/move')>()),
	applyUndo,
	applyRedo
}));

const asScreen = (route: unknown) => route as Component<Record<string, unknown>>;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	applyUndo.mockClear();
	applyRedo.mockClear();

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// the command list brings its first row into view as it opens, which jsdom cannot do.
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
	document.body.innerHTML = '';
});

const draw = (sheet: boolean) =>
	render(PaletteHarness, {
		strings,
		direction: 'ltr',
		screen: asScreen(CoveredScreen),
		screenProps: { sheet }
	});

/** the key with whichever modifier this platform's own shortcuts use, pressed on `target`. */
const press = (target: Element, key: string, code: string, shiftKey = false) =>
	fireEvent.keyDown(
		target,
		usesAppleKeyboard()
			? { key, code, shiftKey, metaKey: true }
			: { key, code, shiftKey, ctrlKey: true }
	);

const pressAll = async (target: Element) => {
	await press(target, 'z', 'KeyZ');
	await press(target, 'z', 'KeyZ', true);
	await press(target, 'y', 'KeyY');
};

test('a sheet over the page holds both keys, focus on a button inside it', async () => {
	draw(true);

	const button = await waitFor(() => {
		const found = document.querySelector<HTMLButtonElement>('[data-covering-button]');

		expect(found).not.toBeNull();

		return found as HTMLButtonElement;
	});

	button.focus();
	expect(document.activeElement).toBe(button);

	await pressAll(button);

	expect(applyUndo).not.toHaveBeenCalled();
	expect(applyRedo).not.toHaveBeenCalled();
});

test('with only the palette open, both keys still move the stack', async () => {
	draw(false);

	await press(document.body, 'k', 'KeyK');
	await waitFor(() =>
		expect(document.querySelector('[data-palette-open]')?.getAttribute('data-palette-open')).toBe(
			'true'
		)
	);

	await pressAll(document.body);

	expect(applyUndo).toHaveBeenCalledTimes(1);
	expect(applyRedo).toHaveBeenCalledTimes(2);
});
