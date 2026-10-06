import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { fakeSettingsHost } from '$lib/settings/tests/testing.ts';
import Harness from '$lib/settings/tests/way-in-preferences-harness.svelte';
import Providers from '#tests/providers.svelte';

/**
 * LANGUAGE AND APPEARANCE ON THE WAY IN
 *
 * Criterion 7 of effort 843, the half about what stays reachable (ticket 04): the foot of a step
 * opens the language and the appearance, and a change shows at once on the step the person is on.
 * Criterion 15 of effort 851: the two are all it opens, on every step, the wall's included.
 */

const host = vi.hoisted(() => ({ settings: null as ReturnType<typeof fakeSettingsHost> | null }));

vi.mock('$lib/api/caller', () => ({
	default: {
		settings: {
			get: () => host.settings!.get(),
			set: (changeset: Parameters<ReturnType<typeof fakeSettingsHost>['set']>[0]) =>
				host.settings!.set(changeset)
		}
	}
}));

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
	// the system's appearance, read through `matchMedia`, which jsdom has none of; the popover's
	// floating-ui measures with a `ResizeObserver`, which it also lacks.
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

beforeEach(() => {
	host.settings = fakeSettingsHost();
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
	document.documentElement.classList.remove('dark');
});

const draw = (props: Record<string, unknown> = {}) =>
	render(Harness, props, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

const openThePreferences = async () => {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-way-in-preferences]')!);
};

const title = () => document.querySelector('h1')?.textContent?.trim();

test('the foot names the language, and opens the language and the appearance alone', async () => {
	draw();

	const trigger = document.querySelector<HTMLElement>(
		'[data-way-in-foot] [data-way-in-preferences]'
	);

	expect(trigger?.textContent?.trim()).toBe('English');

	await openThePreferences();

	expect(document.querySelector('[data-language-choice]')).not.toBeNull();
	expect(document.querySelector('[data-appearance="dark"]')).not.toBeNull();
	// the appearance is its three buttons with nothing above them, named for a screen reader, and
	// there is no way to all the settings (at the human's word on 2026-10-01).
	expect(document.querySelector('#app-appearance-label')).toBeNull();
	expect(
		document
			.querySelector('[data-appearance="dark"]')
			?.closest('[aria-label]')
			?.getAttribute('aria-label')
	).toBe('appearance');
	expect(document.querySelector('a[href="/settings"]')).toBeNull();
	expect(document.querySelector('[data-slot=separator]')).toBeNull();
	// and no other act: the wall's "use a link" and "disconnect this machine" left it for the
	// organization switcher (effort 851, criterion 15). The appearance's three are its only buttons.
	const content = document.querySelector('[data-slot=popover-content]');
	const buttons = [...(content?.querySelectorAll('button') ?? [])].filter(
		(button) => !button.closest('[data-language-choice]')
	);

	expect(buttons.map((button) => button.getAttribute('data-appearance'))).toEqual([
		'system',
		'light',
		'dark'
	]);
	expect(content?.textContent).not.toContain(en.layout.signIn.disconnect);
});

test('choosing another language redraws the step in it, and turns the reading direction', async () => {
	draw();

	expect(title()).toBe(en.settings.title);
	expect(document.querySelector('[data-harness-root]')?.getAttribute('dir')).toBe('ltr');

	await openThePreferences();
	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-language-choice] [data-locale="ar"]')!
	);

	expect(title()).toBe(ar.settings.title);
	expect(document.querySelector('[data-harness-root]')?.getAttribute('dir')).toBe('rtl');
	expect((await host.settings!.get()).locale).toBe('ar');
});

test('choosing dark draws dark at once', async () => {
	draw();

	expect(document.documentElement.classList.contains('dark')).toBe(false);

	await openThePreferences();
	await fireEvent.click(document.querySelector<HTMLElement>('[data-appearance="dark"]')!);

	expect(document.documentElement.classList.contains('dark')).toBe(true);
});
