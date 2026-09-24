import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { shortcuts } from '$lib/design/shortcut-registry.svelte';
import type { ApplicationShortcut } from '$lib/design/shortcut-registry';

import CreateHarness from './create-harness.svelte';
import { expectCreateControlLast } from './create-control';
import ListHarness from './list-harness.svelte';

/**
 * ONE CREATE CONTROL, IN ONE PLACE, AND ONE CREATE KEY
 *
 * Criterion 9 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: (a) the create
 * control sits in the same position on every set, and (b) one key creates in the set on screen.
 * The settings directories' half of (a) is read in their own tests, by the same assertion
 * (`./create-control.ts`), because they are drawn only under the organization's providers.
 */

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	// the one browser fact the list's loading block reaches for that jsdom does not carry; the
	// list's other tests stub it the same way.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	document.body.innerHTML = '';
});

/** the create key, as the registry holds it while the harness is drawn. */
const createKey = () =>
	shortcuts.registered.find((registration) => registration.id === 'create') as
		ApplicationShortcut | undefined;

const pressCreateKey = (modifier: 'ctrlKey' | 'metaKey' = 'ctrlKey') =>
	fireEvent.keyDown(window, { key: 'n', code: 'KeyN', [modifier]: true });

test('the list shell draws its create control last, at the end of the bar above the records', () => {
	render(ListHarness);

	expectCreateControlLast();
});

test('the create key is an application shortcut on ctrl or cmd with n', () => {
	const drawn = render(CreateHarness);
	const key = createKey();

	expect(key).toBeDefined();
	expect(key?.scope).toBe('application');
	expect(key?.keys).toEqual([{ key: 'n', command: true }]);
	expect(key?.describe(i18nObject('en'))).toBe(en.common.actions.newRecord);

	// registered while the frame is drawn, and gone when it is not.
	drawn.unmount();
	expect(createKey()).toBeUndefined();
});

test('where no set is on screen the key is unavailable, with its reason, and creates nothing', async () => {
	render(CreateHarness);

	expect(createKey()?.unavailable?.(i18nObject('en'))).toBe(en.common.ui.nothingToCreateHere);

	// still the application's: the listener takes the key, so the webview never opens a window.
	const event = new KeyboardEvent('keydown', {
		key: 'n',
		code: 'KeyN',
		ctrlKey: true,
		cancelable: true
	});
	window.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
});

test('the key creates in the set on screen, through the same call its control makes', async () => {
	const onCreate = vi.fn();

	render(CreateHarness, { sets: [{ label: 'new record', onCreate }] });

	expect(createKey()?.unavailable?.(i18nObject('en'))).toBeUndefined();

	await pressCreateKey();
	await pressCreateKey('metaKey');
	expect(onCreate).toHaveBeenCalledTimes(2);

	await fireEvent.click(document.querySelector('[data-create-control]')!);
	expect(onCreate).toHaveBeenCalledTimes(3);
});

test('the set drawn last answers, and the one behind it answers again once it goes', async () => {
	const behind = vi.fn();
	const inFront = vi.fn();
	const drawn = render(CreateHarness, {
		sets: [
			{ label: 'behind', onCreate: behind },
			{ label: 'in front', onCreate: inFront }
		]
	});

	await pressCreateKey();
	expect(inFront).toHaveBeenCalledTimes(1);
	expect(behind).not.toHaveBeenCalled();

	await drawn.rerender({ sets: [{ label: 'behind', onCreate: behind }] });
	await pressCreateKey();
	expect(behind).toHaveBeenCalledTimes(1);
});

test('a form standing over the set takes the key, and nothing is opened a second time', async () => {
	const onCreate = vi.fn();

	render(CreateHarness, { sets: [{ label: 'new record', onCreate }] });

	const form = document.createElement('div');
	form.setAttribute('role', 'dialog');
	document.body.append(form);

	await pressCreateKey();
	expect(onCreate).not.toHaveBeenCalled();

	// the command menu is a dialog too, and it is how the key is asked for by name.
	const palette = document.createElement('div');
	palette.setAttribute('data-slot', 'command');
	form.append(palette);

	await pressCreateKey();
	expect(onCreate).toHaveBeenCalledTimes(1);
});

// requirement 16 of effort 832, criterion 16(c): a set that takes no new record right now keeps its
// control, refused, with the reason on hover and focus in one line; the key gives the same reason.
// A contract's ledger is the worked case: paid in full, it takes no new payment, and that line was
// a paragraph above the ledger until the create act carried it.
test('a set that takes no new record keeps its control, refused, and says why', async () => {
	const onCreate = vi.fn();
	const reason = en.contracts.payments.fullyPaidNotice;

	render(CreateHarness, { sets: [{ label: 'new record', onCreate, unavailable: reason }] });

	const control = document.querySelector<HTMLButtonElement>('[data-create-control]')!;

	expect(control.getAttribute('aria-disabled')).toBe('true');
	// reachable by the keyboard, so its reason can be reached too.
	expect(control.disabled).toBe(false);

	const describedBy = control.getAttribute('aria-describedby');

	expect(describedBy && document.getElementById(describedBy)?.textContent).toBe(reason);

	await fireEvent.focus(control);

	await waitFor(() =>
		expect(document.querySelector('[data-slot=tooltip-content]')?.textContent).toContain(reason)
	);

	await fireEvent.click(control);
	await pressCreateKey();

	expect(onCreate).not.toHaveBeenCalled();
	expect(createKey()?.unavailable?.(i18nObject('en'))).toBe(reason);
});
