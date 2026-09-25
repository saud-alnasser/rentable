import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListHarness from './list-harness.svelte';
import { BAR_CONTROL, expectBarOrder } from './set-bar';

/**
 * THE ORDER OF A SET'S BAR, AS THE LIST SHELL DRAWS IT
 *
 * Ticket 30 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: every set's bar
 * orders its controls as the list shell does. This is the list shell's own, which the settings
 * directories are held to in their tests by the same assertion (`./set-bar.ts`).
 */

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	document.body.innerHTML = '';
});

test('the list shell orders its bar: search, count, select, sort, create', () => {
	render(ListHarness);

	expectBarOrder([
		BAR_CONTROL.search,
		BAR_CONTROL.count,
		BAR_CONTROL.select,
		BAR_CONTROL.sort,
		BAR_CONTROL.create
	]);
});
