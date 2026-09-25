import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, within } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { localesMetadata } from '$lib/i18n/i18n-translations-util';
import type { Locales } from '$lib/i18n/i18n-types';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SettingsLocale from '$lib/settings/component/locale.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE LANGUAGE, RENDERED
 *
 * Two languages are a choice of two, so the setting is a toggle group rather than a select
 * ([[rules/interface]], *Field kinds*), the way the appearance beside it is: both are seen, and
 * the one pressed is the one written.
 */

const languages = (currentLocale: Locales, onChange: (locale: Locales) => void) =>
	render(
		SettingsLocale,
		{ currentLocale, onChange },
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);

const group = () => document.querySelector<HTMLElement>('#app-locale')!;
const segment = (locale: Locales) =>
	document.querySelector<HTMLElement>(`#app-locale [data-locale="${locale}"]`)!;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

test('every language is a segment named in its own words, with the current one pressed', () => {
	languages('en', () => {});

	expect(
		within(group())
			.getAllByRole('radio')
			.map((radio) => radio.textContent?.trim())
	).toEqual([localesMetadata.ar.label, localesMetadata.en.label]);
	expect(segment('en').getAttribute('aria-checked')).toBe('true');
	expect(segment('ar').getAttribute('aria-checked')).toBe('false');
});

test('pressing another language writes it, and pressing the current one writes nothing', async () => {
	const written: Locales[] = [];

	languages('en', (locale) => {
		written.push(locale);
	});

	await fireEvent.click(segment('en'));

	expect(written).toEqual([]);
	// a single group would unset on that press; there is always a language.
	expect(segment('en').getAttribute('aria-checked')).toBe('true');

	await fireEvent.click(segment('ar'));

	expect(written).toEqual(['ar']);
});
