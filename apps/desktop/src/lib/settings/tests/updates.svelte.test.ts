import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SettingsUpdates from '$lib/settings/component/updates.svelte';
import { resetUpdateDownload } from '$lib/settings/update-download.svelte';
import type { AvailableUpdate, UpdaterDownloadEvent } from '$lib/update';
import Providers from '#tests/providers.svelte';

/**
 * THE DOWNLOAD OUTLIVES THE TAB
 *
 * Criterion 13 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]]: leaving the general
 * tab while an update downloads neither cancels nor forgets it, and restart cannot be pressed
 * twice. The card is unmounted mid-download and drawn again, as leaving the tab and coming back
 * does, and the download is still there with its progress; the handle is not closed under it.
 *
 * **The updater is the shell's, so it is stood in for.** The release's `downloadAndInstall`
 * reports a start and some progress and then holds until the test lets it finish, which is the
 * window in which a reader leaves the tab.
 */

const { updater } = vi.hoisted(() => ({
	updater: {
		/** what a check finds. */
		next: null as AvailableUpdate | null,
		/** lets the download finish. */
		finish: () => {},
		/** how many downloads were started, and how many times the handle was closed. */
		downloads: 0,
		closes: 0,
		/** whether the restart's mutation is pending, and how many restarts were asked for. */
		restartPending: false,
		restarts: 0
	}
}));

vi.mock('$lib/update/ui', () => ({
	useCheckForUpdate: () => ({ mutateAsync: async () => updater.next }),
	usePrepareUpdate: () => ({ mutateAsync: async () => {} }),
	useRestartApp: () => ({
		get isPending() {
			return updater.restartPending;
		},
		mutateAsync: async () => {
			updater.restarts += 1;
		}
	})
}));

const release = (): AvailableUpdate => ({
	currentVersion: '0.14.0',
	version: '0.15.0',
	date: '2026-10-01T00:00:00Z',
	body: null,
	rawJson: {},
	downloadAndInstall: async (onEvent?: (event: UpdaterDownloadEvent) => void) => {
		updater.downloads += 1;
		onEvent?.({ event: 'Started', data: { contentLength: 200 } });
		onEvent?.({ event: 'Progress', data: { chunkLength: 80 } });
		await new Promise<void>((resolve) => {
			updater.finish = resolve;
		});
		onEvent?.({ event: 'Finished' });
	},
	close: async () => {
		updater.closes += 1;
	}
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	resetUpdateDownload();
	Object.assign(updater, {
		next: release(),
		finish: () => {},
		downloads: 0,
		closes: 0,
		restartPending: false,
		restarts: 0
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
	const install = await screen.findByRole('button', { name: en.common.actions.downloadAndInstall });
	await fireEvent.click(install);

	await expect.poll(progress).toContain('40%');
	first.unmount();

	// leaving the tab neither closed the handle nor stopped the download.
	expect(updater.closes).toBe(0);

	draw();

	// coming back finds it still running, where it had got to, and offers no second install.
	expect(state()).toBe('downloading');
	expect(progress()).toContain('40%');
	expect(
		screen
			.getByRole('button', { name: en.common.actions.installingUpdate })
			.hasAttribute('disabled')
	).toBe(true);

	updater.finish();

	// it finishes once, and the card drawn now says so.
	await expect.poll(state).toBe('restart');
	expect(updater.downloads).toBe(1);
	expect(screen.getByRole('button', { name: en.common.actions.restartApp })).toBeTruthy();
});

test('restart cannot be pressed again while its restart is in flight', async () => {
	const first = draw();

	await fireEvent.click(check());
	await fireEvent.click(
		await screen.findByRole('button', { name: en.common.actions.downloadAndInstall })
	);
	await expect.poll(progress).toContain('40%');
	updater.finish();
	await expect.poll(state).toBe('restart');
	first.unmount();

	// the restart's mutation is pending: the button is drawn disabled, and a press does nothing.
	updater.restartPending = true;
	draw();

	const restart = screen.getByRole('button', { name: en.common.actions.restartApp });

	expect(restart.hasAttribute('disabled')).toBe(true);
	await fireEvent.click(restart);
	expect(updater.restarts).toBe(0);
});
