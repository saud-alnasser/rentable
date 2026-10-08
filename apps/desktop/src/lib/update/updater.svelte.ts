import { get } from 'svelte/store';

import { toErrorDetail } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { syncWorkspaceBeforeExit } from '$lib/sync';

import {
	announceUpdateOutcome,
	failureOf,
	offerRestart,
	withdrawRestartOffer,
	type UpdateFailure,
	type UpdatePhase
} from './announcement';
import type { UpdateHost } from './host';
import { tauri } from './tauri';

/**
 * WHERE THE UPDATE STANDS, OUTSIDE ANY ONE SURFACE THAT SHOWS IT
 *
 * The one update this installation is checking, downloading or waiting to restart into, in one
 * module-level instance. Every surface that draws the update action reads it
 * (`component/update-action.svelte`), and startup asks it to look at launch (`lookAtLaunch`) and
 * whenever a version holds the run (`lookWhileHeld`), so
 * it lives in the update feature rather than in any of theirs. *It was
 * `settings/update-download.svelte.ts` until effort 857 (ticket 10); startup could not reach it
 * there without reaching into settings.*
 *
 * Requirement 13 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]] still holds: leaving
 * a surface while an update downloads neither cancels nor forgets it, since nothing here belongs
 * to a component. **The shell holds the download** (effort 857, ticket 09), so there is no handle
 * here to close; what is kept is what the shell said of the release, and how far it has got.
 *
 * **A press either says its outcome as a toast or leaves it to the surface.** The Settings card
 * has its header's state and announces what a press produced (`voice: 'toast'`); the workspace-held screen
 * and the read-only notice say it on themselves (`voice: 'inline'`), so nothing is raised over
 * them. The launch says nothing until there is something to take: a release ready to install.
 */

/** where a press's outcome is said: a toast, or the surface it was pressed on. */
export type UpdateVoice = 'toast' | 'inline';

/** what the updater reaches: the shell's updater, and the push before the process is replaced. */
export type UpdaterPorts = {
	host: Pick<UpdateHost, 'check' | 'download' | 'install'>;
	/**
	 * push what this machine holds, best effort, before the installer takes the process: the same
	 * push the window's close makes before it goes (`startup/close.ts`).
	 */
	push: () => Promise<unknown>;
};

/** the release this installation could move to, as the shell's check described it. */
export type UpdateRelease = { version: string; date?: string | null; body?: string | null };

const shellPorts = (): UpdaterPorts => ({
	host: tauri,
	push: () => syncWorkspaceBeforeExit()
});

function logUpdaterError(action: string, error: unknown) {
	recordDiagnosticError('update.failed', {
		action,
		code: toTauriErrorCode(error),
		error: toErrorDetail(error)
	});
}

class Updater {
	phase = $state<UpdatePhase>('idle');
	/** the release the last check found, kept while it is downloaded and installed. */
	release = $state<UpdateRelease | null>(null);
	/** what went wrong at the last press, until the next one. */
	failure = $state<UpdateFailure | null>(null);
	downloaded = $state(0);
	total = $state<number | null>(null);

	/** how far the download has got, or `null` where the server sent no length. */
	percent = $derived.by(() => {
		if (!this.total || this.total <= 0) {
			return null;
		}

		return Math.min(100, Math.round((this.downloaded / this.total) * 100));
	});

	/** whether something is under way, so no second press starts beside it. */
	busy = $derived(
		this.phase === 'checking' || this.phase === 'downloading' || this.phase === 'installing'
	);

	#ports: UpdaterPorts;
	#looked = false;

	constructor(ports: UpdaterPorts) {
		this.#ports = ports;
	}

	/** ask the shell whether a newer release exists. */
	async check(voice: UpdateVoice) {
		if (this.busy) {
			return;
		}

		const before = this.phase;

		this.failure = null;
		this.phase = 'checking';

		try {
			const checked = await this.#ports.host.check();

			if (checked.outcome === 'noRelease') {
				this.release = null;
				this.phase = 'upToDate';
			} else {
				// the shell answers a download of the release it already holds at once, so a check
				// that finds the downloaded release again leaves it ready rather than asking again.
				const held = before === 'ready' && this.release?.version === checked.version;

				this.release = { version: checked.version, date: checked.date, body: checked.body };
				this.phase = held ? 'ready' : 'available';
			}

			if (voice === 'toast') {
				announceUpdateOutcome(
					{ kind: 'checked', hasRelease: checked.outcome === 'available' },
					get(LL)
				);
			}
		} catch (error) {
			logUpdaterError('check for updates', error);
			this.failure = failureOf(error);
			this.phase = before === 'checking' ? 'idle' : before;

			if (voice === 'toast') {
				announceUpdateOutcome({ kind: 'failed', error }, get(LL));
			}
		}
	}

	/**
	 * download the release the last check found, and offer the restart once it is in. Resolves to
	 * whether it is in.
	 */
	async download(voice: UpdateVoice): Promise<boolean> {
		const release = this.release;

		if (!release || this.busy || this.phase !== 'available') {
			return false;
		}

		this.failure = null;
		this.phase = 'downloading';
		this.downloaded = 0;
		this.total = null;

		try {
			await this.#ports.host.download((progress) => {
				this.downloaded = progress.downloaded;
				this.total = progress.contentLength;
			});

			if (this.total) {
				this.downloaded = this.total;
			}

			this.phase = 'ready';

			if (voice === 'toast') {
				this.#offer(release.version);
			}

			return true;
		} catch (error) {
			logUpdaterError('download update', error);
			this.failure = failureOf(error);
			this.phase = 'available';

			if (voice === 'toast') {
				announceUpdateOutcome({ kind: 'failed', error }, get(LL));
			}

			return false;
		}
	}

	/**
	 * push what this machine holds, then install the downloaded release and start it.
	 *
	 * **The push comes first, and nothing it meets stops the install**, as the window's close
	 * pushes and goes either way: on Windows the installer exits the process, so whatever was not
	 * pushed by then waits in the replica until the new version's launch pushes it.
	 */
	async install(voice: UpdateVoice) {
		if (this.phase !== 'ready') {
			return;
		}

		this.failure = null;
		this.phase = 'installing';
		withdrawRestartOffer();

		try {
			await this.#ports.push();
		} catch {
			/* the replica keeps it, and the next launch pushes it */
		}

		try {
			// a success does not come back: the installer, or the restart, ends this window.
			await this.#ports.host.install();
		} catch (error) {
			logUpdaterError('install update', error);
			this.failure = failureOf(error);
			this.phase = 'ready';

			if (voice === 'toast') {
				announceUpdateOutcome({ kind: 'failed', error }, get(LL));
			}
		}
	}

	/**
	 * Look for a newer release by itself, once a run, and download one found in the background
	 * (effort 857, requirement 12). Nothing found and nothing reachable are said nowhere, since
	 * nobody asked; a release that is in is offered with the restart, and the shell installs it at
	 * quit if the offer is not taken (ticket 09).
	 */
	async lookAtLaunch() {
		if (this.#looked) {
			return;
		}

		this.#looked = true;

		await this.#look();
	}

	/**
	 * Look again, the way the launch does, because a version holds this run: an organization
	 * refused for its version, a workspace on the workspace-held screen, or read-only by version
	 * (effort 857, requirement 12, ticket 18). Startup asks once as each hold begins
	 * (`startup/machine.ts`), so a held person sees a release that came out after the launch
	 * without pressing anything.
	 */
	async lookWhileHeld() {
		await this.#look();
	}

	/**
	 * check, and download a release found in the background, offering the restart once it is in.
	 * **A look already under way answers for this one, and a release already in needs no other**,
	 * so a hold that begins while the launch is looking adds no second check beside it.
	 */
	async #look() {
		if (this.busy || this.phase === 'ready') {
			return;
		}

		await this.check('inline');

		if (this.phase !== 'available' || !this.release) {
			return;
		}

		const { version } = this.release;

		if (await this.download('inline')) {
			this.#offer(version);
		}
	}

	#offer(version: string) {
		offerRestart(version, () => this.install('toast'), get(LL));
	}

	/** what nothing has asked yet, on the ports given or the shell's. */
	reset(ports: UpdaterPorts) {
		withdrawRestartOffer();
		this.#ports = ports;
		this.#looked = false;
		this.phase = 'idle';
		this.release = null;
		this.failure = null;
		this.downloaded = 0;
		this.total = null;
	}
}

/** the one update this installation is checking, downloading or waiting to restart into. */
export const updater = new Updater(shellPorts());

/**
 * start again from nothing. A test's seam: each test draws the action as a fresh session would,
 * which a module-level instance otherwise carries over from the test before, and stands in for
 * the shell where it says how.
 */
export function resetUpdater(ports: Partial<UpdaterPorts> = {}) {
	updater.reset({ ...shellPorts(), ...ports });
}
