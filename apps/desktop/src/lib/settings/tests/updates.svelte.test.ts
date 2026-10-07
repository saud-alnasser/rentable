import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SettingsUpdates from '$lib/settings/component/updates.svelte';
import { resetUpdater } from '$lib/update/updater.svelte';
import { fakeRelease } from '$lib/update/tests/testing';
import Providers from '#tests/providers.svelte';

/**
 * THE DOWNLOAD OUTLIVES THE TAB
 *
 * Criterion 13 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]]: leaving the general
 * tab while an update downloads neither cancels nor forgets it, and restart cannot be pressed
 * twice. The card is unmounted mid-download and drawn again, as leaving the tab and coming back
 * does, and the download is still there with its progress.
 *
 * **The updater is the shell's, so it is stood in for**, through the updater's own seam: the
 * download reports a start and some progress and then holds until the test lets it finish, which
 * is the window in which a reader leaves the tab, and the install never comes back, as a real one
 * does not.
 */

const updater = {
	/** lets the download finish. */
	finish: () => {},
	/** how many downloads and installs were started. */
	downloads: 0,
	installs: 0
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	Object.assign(updater, { finish: () => {}, downloads: 0, installs: 0 });
	resetUpdater({
		host: {
			check: async () => fakeRelease(),
			download: async (onProgress) => {
				updater.downloads += 1;
				onProgress({ version: '0.15.0', downloaded: 80, contentLength: 200 });
				await new Promise<void>((resolve) => {
					updater.finish = resolve;
				});

				return { version: '0.15.0' };
			},
			install: () => {
				updater.installs += 1;

				return new Promise<void>(() => {});
			}
		},
		push: async () => {}
	});
});

afterEach(() => {
	document.body.innerHTML = '';
});

const wrapper = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

const draw = () => render(SettingsUpdates, { version: '0.14.0' }, wrapper);
const check = () => document.querySelector<HTMLButtonElement>('[data-check-for-updates]')!;
const progress = () =>
	document.querySelector('[data-update-progress]')?.textContent?.replace(/\s+/g, ' ').trim();
const state = () =>
	document.querySelector('[data-updates-state]')?.getAttribute('data-updates-state');

test('a download keeps running and keeps its progress when the card is left and drawn again', async () => {
	const first = draw();

	await fireEvent.click(check());
	const download = await screen.findByRole('button', { name: en.update.actions.download });
	await fireEvent.click(download);

	await expect.poll(progress).toContain('40%');
	first.unmount();

	draw();

	// coming back finds it still running, where it had got to, and offers no second install.
	expect(state()).toBe('downloading');
	expect(progress()).toContain('40%');
	expect(
		screen.getByRole('button', { name: en.update.actions.download }).hasAttribute('disabled')
	).toBe(true);

	updater.finish();

	// it finishes once, and the card drawn now says so.
	await expect.poll(state).toBe('restart');
	expect(updater.downloads).toBe(1);
	expect(screen.getByRole('button', { name: en.update.actions.restart })).toBeTruthy();
});

test('restart cannot be pressed again while its restart is in flight', async () => {
	const first = draw();

	await fireEvent.click(check());
	await fireEvent.click(await screen.findByRole('button', { name: en.update.actions.download }));
	await expect.poll(progress).toContain('40%');
	updater.finish();
	await expect.poll(state).toBe('restart');

	await fireEvent.click(screen.getByRole('button', { name: en.update.actions.restart }));
	await expect.poll(() => updater.installs).toBe(1);
	first.unmount();

	// the install is out: the card drawn again shows restart disabled, and a press does nothing.
	draw();

	const restart = screen.getByRole('button', { name: en.update.actions.restart });

	expect(restart.hasAttribute('disabled')).toBe(true);
	await fireEvent.click(restart);
	expect(updater.installs).toBe(1);
});
