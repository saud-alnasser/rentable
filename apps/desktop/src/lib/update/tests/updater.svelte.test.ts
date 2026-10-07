import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { CheckedUpdate } from '$lib/update';
import { resetUpdater, updater } from '$lib/update/updater.svelte';

import { fakeRelease, noRelease, offline } from './testing';

/**
 * THE APP LOOKS FOR AN UPDATE BY ITSELF
 *
 * Criterion 12 of [[efforts/857-updating-never-locks-a-member-out/spec]], the window's half:
 * startup asks the update to look at launch (`startup/machine.ts`), and a release found
 * downloads in the background, and a toast offers the restart when it is ready. Nothing found and
 * nothing reachable interrupt nobody: a launch nobody pressed anything for raises no toast for
 * either. The other half, installing at quit when the offer is ignored, is the shell's
 * (`tauri/src/update/release.rs`, ticket 09).
 */

const { toasts } = vi.hoisted(() => ({
	toasts: [] as { title: string; action?: { label: string; onClick: () => unknown } }[]
}));

vi.mock('$lib/notification', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/notification')>();
	const raise = (
		title: string,
		options?: { action?: { label: string; onClick: () => unknown } }
	) => {
		toasts.push({ title, action: options?.action });

		return toasts.length;
	};

	return {
		...original,
		notify: { ...original.notify, success: raise, error: raise, dismiss: () => {} },
		showSuccessToast: raise,
		showErrorSentence: raise
	};
});

let sequence: string[];

function shellAnswering(check: () => Promise<CheckedUpdate>) {
	sequence = [];
	resetUpdater({
		host: {
			check: () => {
				sequence.push('check');

				return check();
			},
			download: async (onProgress) => {
				sequence.push('download');
				onProgress({ version: '0.15.0', downloaded: 200, contentLength: 200 });

				return { version: '0.15.0' };
			},
			install: () => {
				sequence.push('install');

				return new Promise<void>(() => {});
			}
		},
		push: async () => void sequence.push('push')
	});
}

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	toasts.length = 0;
});

afterEach(() => {
	resetUpdater();
});

const en = () => i18nObject('en');

test('a launch with a release out downloads it in the background and offers the restart', async () => {
	shellAnswering(async () => fakeRelease());

	await updater.lookAtLaunch();

	expect(sequence).toEqual(['check', 'download']);
	expect(updater.phase).toBe('ready');
	expect(toasts).toHaveLength(1);
	expect(toasts[0]?.title).toBe(en().update.ready({ version: '0.15.0' }));
	expect(toasts[0]?.action?.label).toBe(en().update.actions.restart());

	// taking the offer pushes what this machine holds, then installs and starts the new version.
	await toasts[0]?.action?.onClick();
	await expect.poll(() => sequence).toEqual(['check', 'download', 'push', 'install']);
});

test('a launch with no newer release says nothing', async () => {
	shellAnswering(async () => noRelease());

	await updater.lookAtLaunch();

	expect(sequence).toEqual(['check']);
	expect(updater.phase).toBe('upToDate');
	expect(toasts).toEqual([]);
});

test('a launch that cannot reach the update server says nothing either', async () => {
	shellAnswering(async () => {
		throw offline();
	});

	await updater.lookAtLaunch();

	expect(sequence).toEqual(['check']);
	expect(updater.failure).toBe('offline');
	expect(toasts).toEqual([]);
});

test('the launch looks once, however many passes of startup ask', async () => {
	shellAnswering(async () => noRelease());

	await updater.lookAtLaunch();
	await updater.lookAtLaunch();

	expect(sequence).toEqual(['check']);
});
