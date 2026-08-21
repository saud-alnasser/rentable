import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toErrorMessage } from '$lib/error/message';
import { toast } from 'svelte-sonner';

/**
 * WHAT THE UPDATES SECTION SAYS, AND WHERE IT SAYS IT
 *
 * **The outcome of a check is announced rather than deposited**, which is requirement 2 of
 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]` and the one behaviour the
 * section this replaces did not have: it grew a callout on the press and left it there until the
 * reader went somewhere else. What stands on the section now is only what is true independently
 * of anybody having pressed anything.
 *
 * Kept out of the component for the reason `layout/startup-surface.ts` is: a runes file cannot be
 * imported by the test harness at all, so a decision left inline in one is a decision nothing can
 * drive. This is the decision, and its test is what the criterion asks for.
 *
 * It also keeps the section from raising toasts of its own, which [[rules/frontend]] forbids a
 * component under *Data access*. Two of the four events below are a mutation's and two are not:
 * a check goes through `useCheckForUpdate`, an install runs partly on the handle the check
 * answered with, and a restart is its own mutation. Reporting them in four places, in three
 * shapes, is what this exists instead of.
 */

/** what a check, an install or a restart answered. */
export type UpdateOutcome =
	/**
	 * a check came back.
	 *
	 * `hasRelease` rather than the release itself, because what is announced does not depend on
	 * which version was found: a check that found one is answered by the section changing shape,
	 * and only the check that found nothing has no other way to say so.
	 */
	| { kind: 'checked'; hasRelease: boolean }
	/** an install finished, and what is left is to restart into it. */
	| { kind: 'installed' }
	/** any of the three failed. */
	| { kind: 'failed'; error: unknown };

/** what the reader is told, in the shape a toast takes. */
export type UpdateAnnouncement = {
	tone: 'success' | 'error';
	title: string;
	/** rust's own prose behind the sentence, where a failure crossed the tauri boundary. */
	detail: string | null;
};

/**
 * What an outcome is worth saying, or nothing where the section already said it.
 *
 * **A check that found a release answers with nothing on purpose.** The available-version plate
 * fills in, the release panel appears and a download glyph joins the check, so a toast on top of
 * that is the same news twice. The plates are not an outcome and stand whether or not anybody has
 * pressed anything, which is why the section is allowed to answer this one by itself.
 */
export function describeUpdateOutcome(
	outcome: UpdateOutcome,
	translations: TranslationFunctions
): UpdateAnnouncement | null {
	switch (outcome.kind) {
		case 'checked':
			return outcome.hasRelease
				? null
				: { tone: 'success', title: translations.settings.latestRelease(), detail: null };
		case 'installed':
			return { tone: 'success', title: translations.settings.restartNotice(), detail: null };
		case 'failed': {
			// titled from its code where it crossed the boundary, so the sentence is translated and
			// rust's untranslated prose survives as the description rather than being discarded.
			const { title, detail } = toErrorMessage(outcome.error, translations);

			return { tone: 'error', title, detail };
		}
	}
}

/** Raise it, where there is anything to raise. */
export function announceUpdateOutcome(outcome: UpdateOutcome, translations: TranslationFunctions) {
	const announcement = describeUpdateOutcome(outcome, translations);

	if (!announcement) {
		return;
	}

	const options = { description: announcement.detail ?? undefined };

	if (announcement.tone === 'success') {
		toast.success(announcement.title, options);
	} else {
		toast.error(announcement.title, options);
	}
}
