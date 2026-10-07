import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import UpdateAction from '$lib/update/component/update-action.svelte';
import type { CheckedUpdate, FetchedUpdate, UpdateProgress } from '$lib/update';
import { resetUpdater } from '$lib/update/updater.svelte';
import Providers from '#tests/providers.svelte';

import { fakeRelease, noRelease, offline } from './testing';

/**
 * ONE UPDATE ACTION, IN THREE PLACES
 *
 * Criterion 11 of [[efforts/857-updating-never-locks-a-member-out/spec]], and ticket 10: the update
 * action is drawn on the update screen (`screen`), inside the read-only notice (`notice`) and as
 * the Settings card (`card`), and each is driven here through a check, a download, an install and
 * the restart, and through no release and offline, in both languages. The screen and the notice
 * say each outcome on themselves; the card says where it stands in its header and raises the
 * outcomes a press produces as toasts, as it did before (`update/announcement.ts`).
 *
 * **The shell is stood in for**, through the updater's own seam (`resetUpdater`): each call the
 * action makes is held open until the test settles it, which is the moment the action is read.
 */

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (e: unknown) => void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});

	return { promise, resolve, reject };
}

const { toasts } = vi.hoisted(() => ({
	/** every toast raised, in order, with the offer it carried. */
	toasts: [] as {
		tone: 'success' | 'error';
		title: string;
		action?: { label: string; onClick: () => unknown };
	}[]
}));

vi.mock('$lib/notification', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/notification')>();

	return {
		...original,
		notify: {
			...original.notify,
			success: (
				title: string,
				options?: { action?: { label: string; onClick: () => unknown } }
			) => {
				toasts.push({ tone: 'success', title, action: options?.action });

				return toasts.length;
			},
			dismiss: () => {}
		},
		showSuccessToast: (title: string) => void toasts.push({ tone: 'success', title }),
		showErrorSentence: (title: string) => void toasts.push({ tone: 'error', title })
	};
});

/** what the shell was asked, and the answer each call is waiting on. */
let shell: {
	check: Deferred<CheckedUpdate>;
	download: Deferred<FetchedUpdate>;
	progress: (progress: UpdateProgress) => void;
	sequence: string[];
};

beforeEach(() => {
	loadLocale('en');
	loadLocale('ar');
	toasts.length = 0;
	shell = {
		check: deferred(),
		download: deferred(),
		progress: () => {},
		sequence: []
	};
	resetUpdater({
		host: {
			check: () => {
				shell.sequence.push('check');

				return shell.check.promise;
			},
			download: (onProgress) => {
				shell.sequence.push('download');
				shell.progress = onProgress;

				return shell.download.promise;
			},
			// a success never comes back in a running window: the installer or the restart ends it.
			install: () => {
				shell.sequence.push('install');

				return new Promise<void>(() => {});
			}
		},
		push: async () => void shell.sequence.push('push')
	});
});

afterEach(() => {
	document.body.innerHTML = '';
});

const LOCALES: Locales[] = ['en', 'ar'];

function draw(variant: 'screen' | 'notice' | 'card', locale: Locales): TranslationFunctions {
	setLocale(locale);
	render(
		UpdateAction,
		{ variant, version: '0.14.0' },
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: locale === 'ar' ? ('rtl' as const) : ('ltr' as const) }
		}
	);

	return i18nObject(locale);
}

const sentence = () =>
	document.querySelector('[data-update-sentence]')?.textContent?.replace(/\s+/g, ' ').trim();
const act = () => document.querySelector<HTMLButtonElement>('[data-update-act]');
const figure = () => document.querySelector('[data-update-progress]')?.textContent ?? '';
const state = () =>
	document.querySelector('[data-updates-state]')?.getAttribute('data-updates-state') ?? null;
const check = () => document.querySelector<HTMLButtonElement>('[data-check-for-updates]')!;
const version = { version: '0.15.0' };

for (const variant of ['screen', 'notice'] as const) {
	for (const locale of LOCALES) {
		test(`the ${variant} in ${locale} checks, downloads, installs and restarts, saying each`, async () => {
			const t = draw(variant, locale);

			expect(document.querySelector(`[data-update-action="${variant}"]`)).not.toBeNull();
			expect(sentence()).toBe(t.update.idle());
			expect(act()?.textContent?.trim()).toBe(t.update.actions.check());

			await fireEvent.click(act()!);
			await expect.poll(sentence).toBe(t.update.checking());
			expect(act()?.hasAttribute('disabled')).toBe(true);

			shell.check.resolve(fakeRelease());
			await expect.poll(sentence).toBe(t.update.available(version));
			expect(act()?.textContent?.trim()).toBe(t.update.actions.download());

			await fireEvent.click(act()!);
			await expect.poll(sentence).toBe(t.update.downloading(version));
			shell.progress({ version: '0.15.0', downloaded: 80, contentLength: 200 });
			await expect.poll(figure).toContain('40%');

			shell.download.resolve({ version: '0.15.0' });
			await expect.poll(sentence).toBe(t.update.ready(version));
			expect(act()?.textContent?.trim()).toBe(t.update.actions.restart());

			await fireEvent.click(act()!);
			await expect.poll(sentence).toBe(t.update.installing(version));

			// what this machine holds is pushed before the installer takes the process.
			expect(shell.sequence).toEqual(['check', 'download', 'push', 'install']);
			// the screen and the notice say it on themselves, so nothing is raised over them.
			expect(toasts).toEqual([]);
		});

		test(`the ${variant} in ${locale} says when there is no newer release`, async () => {
			const t = draw(variant, locale);

			await fireEvent.click(act()!);
			shell.check.resolve(noRelease());

			await expect.poll(sentence).toBe(t.update.upToDate());
			expect(act()?.textContent?.trim()).toBe(t.update.actions.check());
			expect(toasts).toEqual([]);
		});

		test(`the ${variant} in ${locale} says when the update server cannot be reached`, async () => {
			const t = draw(variant, locale);

			await fireEvent.click(act()!);
			shell.check.reject(offline());

			await expect.poll(sentence).toBe(t.update.offline());
			expect(act()?.textContent?.trim()).toBe(t.update.actions.tryAgain());
			expect(toasts).toEqual([]);
		});
	}
}

for (const locale of LOCALES) {
	test(`the card in ${locale} checks, downloads, installs and restarts, saying each`, async () => {
		const t = draw('card', locale);

		expect(document.querySelector('[data-update-action="card"]')).not.toBeNull();
		expect(state()).toBeNull();

		await fireEvent.click(check());
		await expect.poll(state).toBe('checking');
		expect(document.querySelector('[data-updates-state]')?.textContent?.trim()).toBe(
			t.settings.updatesState.checking()
		);

		shell.check.resolve(fakeRelease());
		await expect.poll(state).toBe('available');

		await fireEvent.click(await screen.findByRole('button', { name: t.update.actions.download() }));
		await expect.poll(state).toBe('downloading');
		shell.progress({ version: '0.15.0', downloaded: 80, contentLength: 200 });
		await expect.poll(figure).toContain('40%');

		shell.download.resolve({ version: '0.15.0' });
		await expect.poll(state).toBe('restart');

		// the download finished: a toast says so and offers the restart, as the launch's does.
		expect(toasts).toHaveLength(1);
		expect(toasts[0]?.title).toBe(t.update.ready(version));
		expect(toasts[0]?.action?.label).toBe(t.update.actions.restart());

		await fireEvent.click(screen.getByRole('button', { name: t.update.actions.restart() }));
		await expect.poll(() => shell.sequence).toEqual(['check', 'download', 'push', 'install']);
	});

	test(`the card in ${locale} says when there is no newer release`, async () => {
		const t = draw('card', locale);

		await fireEvent.click(check());
		shell.check.resolve(noRelease());

		await expect.poll(state).toBe('upToDate');
		expect(toasts).toEqual([{ tone: 'success', title: t.update.upToDate() }]);
	});

	test(`the card in ${locale} says when the update server cannot be reached`, async () => {
		const t = draw('card', locale);

		await fireEvent.click(check());
		shell.check.reject(offline());

		await expect.poll(() => toasts).toEqual([{ tone: 'error', title: t.update.offline() }]);
		expect(check().hasAttribute('disabled')).toBe(false);
	});
}

test('every outcome has a sentence of its own, in each language', () => {
	for (const locale of LOCALES) {
		const t = i18nObject(locale);
		const sentences = [
			t.update.idle(),
			t.update.checking(),
			t.update.available(version),
			t.update.downloading(version),
			t.update.ready(version),
			t.update.installing(version),
			t.update.upToDate(),
			t.update.offline(),
			t.update.failed()
		];

		expect(new Set(sentences).size).toBe(sentences.length);
	}

	expect(i18nObject('ar').update.offline()).not.toBe(i18nObject('en').update.offline());
});
