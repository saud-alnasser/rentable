import { render } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import type { Section, SettingsSectionProps } from '$lib/feature/surface';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
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
 */

/** what the settings query answers: its data, whether it is still asking, and why it failed. */
const { reading } = vi.hoisted(() => ({
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

const page = (sections: Section<'settings'>[]) => {
	loadLocale('en');
	setLocale('en');

	render(
		SettingsPage,
		{ signedIn: true, sections, leaveForTheWall: async () => {} },
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
