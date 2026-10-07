import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
import SettingsUpdates from '$lib/settings/component/updates.svelte';
import type { CheckedUpdate } from '$lib/update';
import { resetUpdater } from '$lib/update/updater.svelte';
import { noRelease } from '$lib/update/tests/testing';
import Providers from '#tests/providers.svelte';

/**
 * THE CHECK TURNS AND THE FOLDER OPENS
 *
 * Ticket 34 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the
 * human's word of 2026-10-02: "the icon of update check needs to be rotating with anitmion while
 * checking and the open log the folder icon needs to be look like it opend when clicked with
 * animtion". The check's glyph turns while a check is pending and the button is busy; the reveal's
 * closed folder crosses to the open one when pressed. Under reduced motion each state still
 * changes, and neither carries a class that moves.
 *
 * **The reader's setting is `matchMedia`**, which jsdom does not have, so it is stood in for per
 * test; with none at all the answer is no, as `reducesMotion` says.
 */

/** the check's answer, held open until the test settles it. */
const updater = { settle: (() => {}) as (checked: CheckedUpdate) => void };

/** the reader has, or has not, asked for less motion. */
const reduce = (reduced: boolean) =>
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: reduced && query === '(prefers-reduced-motion: reduce)',
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		onchange: null,
		dispatchEvent: () => false
	}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	resetUpdater({
		host: {
			check: () =>
				new Promise<CheckedUpdate>((resolve) => {
					updater.settle = resolve;
				}),
			download: async () => ({ version: '0.15.0' }),
			install: async () => {}
		},
		push: async () => {}
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	document.body.innerHTML = '';
});

const wrapper = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

const check = () => document.querySelector<HTMLButtonElement>('[data-check-for-updates]')!;
const turning = () =>
	document
		.querySelector('[data-check-for-updates-glyph]')!
		.getAttribute('class')!
		.split(/\s+/)
		.some((name) => /animate-/.test(name) && !/animate-none/.test(name));

for (const reduced of [false, true]) {
	test(`the check's glyph ${reduced ? 'holds still under reduced motion' : 'turns'} while a check is pending, and the button is busy`, async () => {
		reduce(reduced);
		render(SettingsUpdates, { version: '0.14.0' }, wrapper);

		expect(check().getAttribute('aria-busy')).not.toBe('true');
		expect(turning()).toBe(false);

		await fireEvent.click(check());

		// pending: busy for whoever listens, and turning for whoever looks, unless they asked not.
		await expect.poll(() => check().getAttribute('aria-busy')).toBe('true');
		expect(check().getAttribute('aria-label')).toBe(en.common.actions.checkingForUpdates);
		expect(turning()).toBe(!reduced);
		if (!reduced) {
			// the media query holds it still too, should the reader ask while it turns.
			expect(
				document.querySelector('[data-check-for-updates-glyph]')!.getAttribute('class')
			).toContain('motion-reduce:animate-none');
		}

		updater.settle(noRelease());

		// answered: no longer busy, and the glyph at rest.
		await expect.poll(() => check().getAttribute('aria-busy')).not.toBe('true');
		expect(turning()).toBe(false);
		expect(check().getAttribute('aria-label')).toBe(en.common.actions.checkForUpdates);
	});
}

const reveal = () => document.querySelector<HTMLButtonElement>('[data-diagnostics-reveal]')!;
const glyph = (state: 'closed' | 'open') =>
	reveal().querySelector<SVGElement>(`[data-diagnostics-reveal-glyph=${state}]`)!;
const shown = (state: 'closed' | 'open') =>
	glyph(state).getAttribute('class')!.split(/\s+/).includes('opacity-100');
const crosses = (state: 'closed' | 'open') =>
	glyph(state)
		.getAttribute('class')!
		.split(/\s+/)
		.some((name) => name.startsWith('transition-'));

for (const reduced of [false, true]) {
	test(`pressing reveal opens the folder ${reduced ? 'at once under reduced motion' : 'with a crossing'}, and it closes after`, async () => {
		reduce(reduced);
		vi.useFakeTimers();
		const onRevealDiagnostics = vi.fn();

		render(SettingsDiagnostics, { diagnosticsDir: 'C:/logs', onRevealDiagnostics }, wrapper);

		// at rest, a closed folder.
		expect(shown('closed')).toBe(true);
		expect(shown('open')).toBe(false);

		await fireEvent.click(reveal());

		expect(onRevealDiagnostics).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(reveal().dataset.opened).toBe('true'));
		expect(shown('open')).toBe(true);
		expect(shown('closed')).toBe(false);

		for (const state of ['closed', 'open'] as const) {
			expect(crosses(state)).toBe(!reduced);
			if (!reduced) {
				const names = glyph(state).getAttribute('class')!;

				// the crossing is the vocabulary's, never a number of its own.
				expect(names).toContain('duration-quick');
				expect(names).toContain('ease-move');
				expect(names).toContain('motion-reduce:transition-none');
			}
		}

		// and closes once the system's folder has had time to come up.
		await vi.advanceTimersByTimeAsync(5000);
		expect(reveal().dataset.opened).toBe('false');
		expect(shown('closed')).toBe(true);
		expect(shown('open')).toBe(false);
	});
}
