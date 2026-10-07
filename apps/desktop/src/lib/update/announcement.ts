import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toErrorMessage } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import {
	notify,
	showErrorSentence,
	showSuccessToast,
	type NotificationId
} from '$lib/notification';

/**
 * WHAT THE UPDATE SAYS, AND WHERE IT SAYS IT
 *
 * Every sentence the update speaks, decided here and nowhere in a component: a runes file cannot
 * be imported by the `node:test` harness at all, so a decision left inline in one is a decision
 * nothing can drive. *This was `settings/update-announcement.ts` until effort 857 (ticket 10)
 * moved it beside the updater, so startup can reach it without reaching into settings.*
 *
 * **Two voices.** Where the update action stands on its own, on the workspace-held screen and inside the
 * read-only notice, it says where the update stands on itself (`describeUpdate`), since the person
 * reading it is held and looking at it. The Settings card says it in its header's state instead,
 * and announces what a press produced as a toast rather than depositing it (requirement 2 of
 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]`), so the card stays as it was.
 *
 * **A release ready to install is offered as a toast carrying the restart**, whichever way it got
 * downloaded: from the card, or in the background after the launch looked (effort 857,
 * requirement 12). The offer stays until it is taken or dismissed, since it waits on the reader
 * and interrupts nothing.
 */

/** what went wrong, as the reader is told it: the update server out of reach, or anything else. */
export type UpdateFailure = 'offline' | 'failed';

/** where the update stands. */
export type UpdatePhase =
	'idle' | 'checking' | 'available' | 'upToDate' | 'downloading' | 'ready' | 'installing';

/** what a sentence about the update is read from. */
export type UpdateView = {
	phase: UpdatePhase;
	release: { version: string } | null;
	failure: UpdateFailure | null;
};

/** a thrown value as the reader is told it: a request that never got an answer is offline. */
export function failureOf(error: unknown): UpdateFailure {
	return toTauriErrorCode(error) === 'network' ? 'offline' : 'failed';
}

/** where the update stands, in one sentence, for an action that says it on itself. */
export function describeUpdate(view: UpdateView, translations: TranslationFunctions): string {
	const t = translations.update;

	if (view.failure) {
		return view.failure === 'offline' ? t.offline() : t.failed();
	}

	const version = view.release?.version ?? '';

	switch (view.phase) {
		case 'idle':
			return t.idle();
		case 'checking':
			return t.checking();
		case 'available':
			return t.available({ version });
		case 'upToDate':
			return t.upToDate();
		case 'downloading':
			return t.downloading({ version });
		case 'ready':
			return t.ready({ version });
		case 'installing':
			return t.installing({ version });
	}
}

/** what a press on the Settings card produced, where it is worth a toast. */
export type UpdateOutcome =
	/**
	 * a check came back.
	 *
	 * `hasRelease` rather than the release itself, because what is announced does not depend on
	 * which version was found: a check that found one is answered by the card changing shape, and
	 * only the check that found nothing has no other way to say so.
	 */
	| { kind: 'checked'; hasRelease: boolean }
	/** a check, a download or an install failed. */
	| { kind: 'failed'; error: unknown };

/** what the reader is told, in the shape a toast takes. */
export type UpdateAnnouncement = {
	tone: 'success' | 'error';
	title: string;
};

/**
 * What an outcome is worth saying, or nothing where the card already said it.
 *
 * **A check that found a release answers with nothing on purpose.** The available version fills
 * in and the download joins the check, so a toast on top of that is the same news twice.
 */
export function describeUpdateOutcome(
	outcome: UpdateOutcome,
	translations: TranslationFunctions
): UpdateAnnouncement | null {
	switch (outcome.kind) {
		case 'checked':
			return outcome.hasRelease ? null : { tone: 'success', title: translations.update.upToDate() };
		case 'failed': {
			// offline has its own sentence. Anything else is titled from its code where it crossed
			// the boundary, so the sentence is translated; rust's untranslated prose is not the
			// toast's, and the updater records it in diagnostics ([[rules/interface]], *Error*).
			const title =
				failureOf(outcome.error) === 'offline'
					? translations.update.offline()
					: toErrorMessage(outcome.error, translations).title;

			return { tone: 'error', title };
		}
	}
}

/** Raise it, where there is anything to raise. */
export function announceUpdateOutcome(outcome: UpdateOutcome, translations: TranslationFunctions) {
	const announcement = describeUpdateOutcome(outcome, translations);

	if (!announcement) {
		return;
	}

	if (announcement.tone === 'success') {
		showSuccessToast(announcement.title);
	} else {
		showErrorSentence(announcement.title);
	}
}

/** the toast offering the restart, where one is on screen. */
let outstandingOffer: NotificationId | null = null;

/**
 * Offer the restart into a downloaded release, withdrawing an earlier offer first.
 *
 * It stays until it is taken or dismissed: it waits on the reader rather than telling them
 * something, and taking it is the one way it could be missed.
 */
export function offerRestart(
	version: string,
	restart: () => unknown,
	translations: TranslationFunctions
) {
	withdrawRestartOffer();

	outstandingOffer = notify.success(translations.update.ready({ version }), {
		action: { label: translations.update.actions.restart(), onClick: () => void restart() },
		duration: Number.POSITIVE_INFINITY
	});
}

/** take the restart's offer off screen, where one is there. */
export function withdrawRestartOffer() {
	if (outstandingOffer !== null) {
		notify.dismiss(outstandingOffer);
		outstandingOffer = null;
	}
}
