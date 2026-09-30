import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { surfaces } from '$lib/app/surfaces';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { setLocale } from '$lib/i18n/i18n-svelte';
import Frame from '$lib/shell/component/frame.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE HOSTS THE FRAME MOUNTS, AND WHERE THE COMMAND MENU STANDS AMONG THEM
 *
 * Ticket 67 of effort 840, criterion 19: the frame mounts every surface's host in
 * `app/surfaces.ts`'s order, and a host may depend on what mounted before it. The command menu is
 * one of them, and stands where the frame drew it before the effort: after the workspace's
 * permissions and before the tenant's host. Its trigger is the frame's search button, which opens
 * it through the menu's own state rather than a binding the frame holds.
 */

// the window the controls ask about, which jsdom has none of.
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({
		isMaximized: async () => false,
		isFullscreen: async () => false,
		onResized: async () => () => {}
	})
}));

// the rail's contents are not what is under test, so it draws nothing here, as in
// `frame.svelte.test.ts`.
vi.mock('$lib/shell/component/sidebar.svelte', () => ({ default: () => {} }));

beforeAll(() => {
	loadLocale('en');
	setLocale('en');
	// the two browser facts the rail's state reaches for, as `frame.svelte.test.ts` stubs them.
	document.documentElement.style.setProperty('--breakpoint-shell', '48rem');
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
	// the menu scrolls its highlighted row into view as it opens, which jsdom lays out none of.
	Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
	document.body.innerHTML = '';
});

test('the hosts mount in the order they did before effort 840, the command menu second', () => {
	expect(surfaces.filter((surface) => surface.host).map((surface) => surface.name)).toEqual([
		'workspace',
		'palette',
		'tenant',
		'complex',
		'unit',
		'contract',
		'payment',
		'organization'
	]);
});

test('the search button opens the command menu its host mounted', async () => {
	const children = createRawSnippet(() => ({ render: () => '<p data-route>a screen</p>' }));

	render(
		Frame,
		{ currentDirection: 'ltr', shell: 'full', children },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(screen.queryByRole('dialog')).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.common.ui.commandPalette }));

	expect(await screen.findByRole('dialog')).not.toBeNull();
});
