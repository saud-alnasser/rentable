import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SettingsEndingSoon from '$lib/settings/component/ending-soon.svelte';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import Providers from '#tests/providers.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE ENDING-SOON NOTICE, RENDERED
 *
 * A number field holds no number while it is being edited: emptied, or holding what is not a
 * number, it reads as `null`. The field says so by staying on screen, rather than by the area
 * failing over a value it cannot trim.
 */

const field = () => document.querySelector<HTMLInputElement>('#ending-soon-notice-days')!;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('an emptied field stays on screen, with its save offered', async () => {
	render(
		SettingsEndingSoon,
		{ settings: fakeSettings({ endingSoonNoticeDays: 60 }) },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(field().value).toBe('60');

	await fireEvent.input(field(), { target: { value: '' } });

	expect(field()).not.toBeNull();
	expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
});
