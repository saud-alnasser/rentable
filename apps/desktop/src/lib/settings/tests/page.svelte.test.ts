import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { tick } from 'svelte';

import type { Section, SettingsSectionProps } from '$lib/feature/surface';
import en from '$lib/i18n/en';
import { locale, setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { LOADING_DELAY } from '@rentable/design/block/loading.svelte';
import { get } from 'svelte/store';
import type { Settings } from '$lib/settings/host.ts';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import SettingsPage from '$lib/settings/component/page.svelte';
import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import type { Component } from 'svelte';

import Providers from '#tests/providers.svelte';

/**
 * THE SETTINGS PAGE'S CONTRIBUTIONS, STARTED AS IT MOUNTS
 *
 * A contributed section's `load` runs as the page is set up, beside the settings query and
 * whichever section is shown, so what it reads is asked for as the page mounts and switching to it
 * draws data rather than a load. **It does not wait on the settings**: the area is drawn only once
 * they have arrived, and the organization's reads started beside them before effort 840, so they
 * start while the settings query is pending and where it fails (ticket 67). The area with the
 * window's own contributions is read in `app/tests/settings-area.svelte.test.ts`; here the page is
 * handed one it names nothing of, whose component is never drawn.
 *
 * *This read the area until ticket 67 of effort 840, which moved the loads to the page.*
 *
 * THE SETTINGS OPENED SIGNED OUT
 *
 * Criterion 7 of effort 843: signed out there is no rail to leave the settings by, so the page
 * draws back in the corner of the way-in frame, and it goes back to the way in. The frame it draws
 * on is `startup/screen.ts`'s `shellFor`, driven by `startup/tests/screen.test.ts`; what is
 * asserted here is the page's half. *The route drew back, and was read for it, until effort 843's
 * ticket 16.*
 *
 * GENERAL'S CHOICES, REFUSED
 *
 * Criterion 4 of effort 846, for general: the language and the appearance apply the moment one is
 * pressed, and a write the shell refuses puts the old one back and says why through the shared
 * handler. The write is stood in for, refusing with a code the shell sends, and the toast is stood
 * in for too, so what it was asked to raise is what is asserted.
 */

/** what the settings query answers: its data, whether it is still asking, and why it failed. */
const { reading, raised } = vi.hoisted(() => ({
	raised: [] as string[],
	reading: {
		current: { isLoading: false, data: undefined, error: null } as {
			isLoading: boolean;
			data: Settings | undefined;
			error: Error | null;
		}
	}
}));

vi.mock('$lib/settings/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/settings/query')>()),
	useFetchSettings: () => ({ ...reading.current, refetch: async () => {} })
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: () => {},
		error: (message: string) => raised.push(message),
		warning: () => {},
		dismiss: () => {}
	}
}));

// the shell refuses every write: its disk could not be written.
vi.mock('$lib/api/caller', () => ({
	default: {
		settings: {
			get: async () => (await import('$lib/settings/tests/testing.ts')).fakeSettings(),
			set: async () => {
				throw Object.assign(new Error('the settings file could not be written'), { code: 'io' });
			}
		}
	}
}));

beforeAll(() => {
	// the system's appearance is read through `matchMedia`, which jsdom has none of.
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

const contribution = () => {
	const load = vi.fn();
	const hidden: Section<'settings'> = {
		on: 'settings',
		order: 10,
		value: 'account',
		label: () => 'account',
		// never drawn, since the general section is the one shown.
		component: SettingsDiagnostics as unknown as Component<SettingsSectionProps>,
		load
	};

	return { load, hidden };
};

afterEach(() => {
	document.body.innerHTML = '';
	document.documentElement.classList.remove('dark');
	raised.length = 0;
	vi.useRealTimers();
});

const page = (sections: Section<'settings'>[], signedIn = true) => {
	loadLocale('en');
	setLocale('en');

	render(
		SettingsPage,
		{ signedIn, sections, leaveForTheWall: async () => {}, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);
};

test('a contributed section starts what it reads even while another section is shown', () => {
	reading.current = { isLoading: false, data: fakeSettings(), error: null };

	const { load, hidden } = contribution();

	page([hidden]);

	expect(document.querySelector('[data-general]')).not.toBeNull();
	expect(load).toHaveBeenCalledTimes(1);
});

test('a contributed section starts what it reads while the settings are still being read', () => {
	reading.current = { isLoading: true, data: undefined, error: null };

	const { load, hidden } = contribution();

	page([hidden]);

	// the area is not drawn yet, and the read has started anyway.
	expect(document.querySelector('[data-general]')).toBeNull();
	expect(load).toHaveBeenCalledTimes(1);
});

test('a contributed section starts what it reads where the settings failed to load', () => {
	reading.current = { isLoading: false, data: undefined, error: new Error('refused') };

	const { load, hidden } = contribution();

	page([hidden]);

	expect(document.querySelector('[data-general]')).toBeNull();
	expect(load).toHaveBeenCalledTimes(1);
});

test('signed out, the settings draw back in the corner of the frame', () => {
	reading.current = { isLoading: false, data: fakeSettings(), error: null };

	page([], false);

	const back = document.querySelector('[data-back-control]');

	expect(back).not.toBeNull();
	expect(back?.closest('.absolute')?.className).toContain('start-4');
	expect(back?.closest('.absolute')?.className).toContain('top-4');
});

test('signed in, the rail is the way out and the settings draw no back of their own', () => {
	reading.current = { isLoading: false, data: fakeSettings(), error: null };

	page([]);

	expect(document.querySelector('[data-back-control]')).toBeNull();
});

test('a language the shell refuses to write is put back, and the shared handler says why', async () => {
	reading.current = { isLoading: false, data: fakeSettings(), error: null };

	page([]);

	await fireEvent.click(document.querySelector<HTMLElement>('#app-locale [data-locale="ar"]')!);

	await waitFor(() => expect(raised).toEqual([en.common.errors.io]));
	expect(get(locale)).toBe('en');
	expect(
		document.querySelector('#app-locale [data-locale="en"]')?.getAttribute('aria-checked')
	).toBe('true');
});

test('an appearance the shell refuses to write is put back, and the shared handler says why', async () => {
	reading.current = { isLoading: false, data: fakeSettings({ appearance: 'light' }), error: null };

	page([]);

	await fireEvent.click(document.querySelector<HTMLElement>('[data-appearance="dark"]')!);

	await waitFor(() => expect(raised).toEqual([en.common.errors.io]));
	expect(document.documentElement.classList.contains('dark')).toBe(false);
	// what is shown pressed is the choice being written while it is, and the stored one after.
	await waitFor(() =>
		expect(document.querySelector('[data-appearance="light"]')?.getAttribute('aria-checked')).toBe(
			'true'
		)
	);
});

// the loading shape is the area's: the title, the rail, and a section's groups of rows.
test('while the settings are read, the skeleton draws grouped rows', async () => {
	vi.useFakeTimers();
	reading.current = { isLoading: true, data: undefined, error: null };

	page([]);

	vi.advanceTimersByTime(LOADING_DELAY);
	await tick();

	const groups = [...document.querySelectorAll('[data-loading=skeleton] [data-skeleton-group]')];

	expect(groups.length).toBeGreaterThan(1);

	for (const group of groups) {
		expect(group.querySelectorAll('[data-skeleton-row]').length).toBeGreaterThan(0);
	}
});
