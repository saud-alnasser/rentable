import { render } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import type { Section, SettingsSectionProps } from '$lib/feature/surface';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import SettingsArea from '$lib/settings/component/area.svelte';
import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import type { Component } from 'svelte';

import Providers from '#tests/providers.svelte';

/**
 * THE SETTINGS AREA'S CONTRIBUTIONS, STARTED AS IT OPENS
 *
 * A contributed section's `load` runs as the area is set up, whichever section is shown, so what
 * it reads is asked for as the area opens and switching to it draws data rather than a load. The
 * area with the window's own contributions is read in `app/tests/settings-area.svelte.test.ts`;
 * here it is handed one it names nothing of, whose component is never drawn.
 */

const noop = () => {};

test('a contributed section starts what it reads even while another section is shown', () => {
	loadLocale('en');
	setLocale('en');

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

	render(
		SettingsArea,
		{
			section: 'general',
			settings: fakeSettings(),
			signedIn: true,
			sections: [hidden],
			onChangeLocale: noop,
			onRevealDiagnostics: noop,
			leaveForTheWall: async () => {}
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(document.querySelector('[data-general]')).not.toBeNull();
	expect(load).toHaveBeenCalledTimes(1);
});
