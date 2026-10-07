import { get } from 'svelte/store';

import { toErrorDetail } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { announceUpdateOutcome } from '$lib/settings/update-announcement';
import type { AvailableUpdate, UpdaterDownloadEvent } from '$lib/update';

/**
 * WHERE THE UPDATE STANDS, OUTSIDE THE CARD THAT SHOWS IT
 *
 * Requirement 13 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]]: leaving the general
 * settings tab while an update downloads neither cancels nor forgets it. The updates card
 * (`settings/component/updates.svelte`) is unmounted with its tab, so whatever it held itself was
 * lost with it, and it closed the release's handle on the way out, mid-download. What a check
 * found and how far a download has got live here instead, in one module-level instance the way
 * `organization/dialogs.svelte.ts` holds its panels, and the card only reads them and asks.
 *
 * **The card hands in its mutations' `mutateAsync`** rather than this module calling the
 * update's hooks, since a hook needs a component to run in. A mutation keeps running after the
 * observer that started it unmounts, so the promise this awaits settles whether or not anybody
 * is still looking, and the outcome is announced either way.
 *
 * **A handle is closed only when a check replaces it, or once it has installed.** Nothing about
 * a card going away closes it.
 */

/** the release this installation could move to, kept after the handle behind it is closed. */
export type UpdateRelease = { version: string; date?: string | null; body?: string | null };

function logUpdaterError(action: string, error: unknown) {
	recordDiagnosticError('update.failed', {
		action,
		code: toTauriErrorCode(error),
		error: toErrorDetail(error)
	});
}

class UpdateDownload {
	/**
	 * the facts of the release a check found, copied off the handle as it answers.
	 *
	 * `available` is a live handle and installing closes it, so reading the version and the notes
	 * off it would empty the card at the moment the reader most wants to see what they are
	 * installing.
	 */
	release = $state<UpdateRelease | null>(null);
	/** the handle `downloadAndInstall` is called on, until it installs or a check replaces it. */
	available = $state<AvailableUpdate | null>(null);
	checking = $state(false);
	installing = $state(false);
	installed = $state(false);
	/** a check has answered this session, so *up to date* is a fact and not a guess. */
	hasChecked = $state(false);
	downloaded = $state(0);
	total = $state<number | null>(null);

	/** how far the download has got, or `null` where the server sent no length. */
	percent = $derived.by(() => {
		if (!this.total || this.total <= 0) {
			return null;
		}

		return Math.min(100, Math.round((this.downloaded / this.total) * 100));
	});

	async check(checkFn: () => Promise<AvailableUpdate | null>) {
		if (this.checking || this.installing) {
			return;
		}

		this.checking = true;
		this.installed = false;
		this.downloaded = 0;
		this.total = null;

		try {
			const update = await checkFn();

			await this.closeAvailable();
			this.available = update;
			this.release = update && { version: update.version, date: update.date, body: update.body };
			this.hasChecked = true;

			announceUpdateOutcome({ kind: 'checked', hasRelease: update !== null }, get(LL));
		} catch (error) {
			logUpdaterError('check for updates', error);
			announceUpdateOutcome({ kind: 'failed', error }, get(LL));
		}

		this.checking = false;
	}

	async install(prepareFn: (input: { targetVersion: string }) => Promise<unknown>) {
		const update = this.available;

		if (!update || this.installing) {
			return;
		}

		this.installing = true;
		this.installed = false;
		this.downloaded = 0;
		this.total = null;

		try {
			await prepareFn({ targetVersion: update.version });

			await update.downloadAndInstall((event: UpdaterDownloadEvent) => {
				switch (event.event) {
					case 'Started':
						this.total = event.data.contentLength ?? null;
						this.downloaded = 0;
						break;
					case 'Progress':
						this.downloaded += event.data.chunkLength;
						break;
					case 'Finished':
						if (this.total) {
							this.downloaded = this.total;
						}
						break;
				}
			});

			this.installed = true;
			this.available = null;
			await update.close();
			announceUpdateOutcome({ kind: 'installed' }, get(LL));
		} catch (error) {
			logUpdaterError('install update', error);
			announceUpdateOutcome({ kind: 'failed', error }, get(LL));
		}

		this.installing = false;
	}

	/** what nothing has asked yet: no release, no download, and no handle held open. */
	reset() {
		void this.closeAvailable();
		this.release = null;
		this.available = null;
		this.checking = false;
		this.installing = false;
		this.installed = false;
		this.hasChecked = false;
		this.downloaded = 0;
		this.total = null;
	}

	private async closeAvailable() {
		if (!this.available) {
			return;
		}

		try {
			await this.available.close();
		} catch {
			/* ignore */
		}
	}
}

/** the one update this installation is checking, downloading or waiting to restart into. */
export const updateDownload = new UpdateDownload();

/**
 * start again from nothing. A test's seam: each test draws the card as a fresh session would,
 * which a module-level instance otherwise carries over from the test before.
 */
export function resetUpdateDownload() {
	updateDownload.reset();
}
