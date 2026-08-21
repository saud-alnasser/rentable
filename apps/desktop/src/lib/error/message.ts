import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toTauriErrorCode } from '$lib/error/tauri';

const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

/**
 * Wrap a fragment that runs left to right whatever the sentence around it does — a file
 * path, a filename, a URL.
 *
 * Without it the fragment reorders the Arabic sentence it is spliced into, and the reader is
 * shown a path with its pieces in an order the filesystem does not have.
 */
export function isolateDirection(fragment: string) {
	return `${FIRST_STRONG_ISOLATE}${fragment}${POP_DIRECTIONAL_ISOLATE}`;
}

/**
 * the message a caller reads: a sentence to show, and the underlying prose
 * behind it where there is any.
 */
export type ErrorMessage = {
	title: string;
	detail: string | null;
};

function toText(value: unknown) {
	return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * the human-readable prose a thrown value carries, whatever shape it arrived
 * in — an `Error`, a bare string, or a rejected command payload.
 */
export function toErrorDetail(error: unknown): string | null {
	if (error instanceof Error) {
		return toText(error.message);
	}

	if (typeof error === 'string') {
		return toText(error);
	}

	if (typeof error === 'object' && error !== null && 'message' in error) {
		return toText((error as { message: unknown }).message);
	}

	return null;
}

/**
 * render a thrown value for the user. a failure that crossed the tauri boundary
 * is titled from its code so it is translated, and rust's untranslated prose is
 * kept as detail rather than discarded — it is the only description of what
 * actually went wrong. anything raised inside typescript is already written in
 * the user's language, so it is shown as it was written.
 *
 * `fallback` replaces the generic message when there is nothing readable at all,
 * for callers that can say something more useful about where the failure was.
 */
export function toErrorMessage(
	error: unknown,
	translations: TranslationFunctions,
	fallback?: string
): ErrorMessage {
	const code = toTauriErrorCode(error);

	if (code) {
		return { title: translations.common.errors[code](), detail: toErrorDetail(error) };
	}

	return {
		title: toErrorDetail(error) ?? fallback ?? translations.common.messages.unexpectedError(),
		detail: null
	};
}

/**
 * `toErrorMessage` flattened onto one line, for the places that render a single
 * string and have nowhere to put a description.
 */
export function toErrorText(
	error: unknown,
	translations: TranslationFunctions,
	fallback?: string
): string {
	const { title, detail } = toErrorMessage(error, translations, fallback);

	if (!detail) {
		return title;
	}

	// a title with nothing in it is a translation that is not loaded, which happens on the one
	// screen drawn before a locale is. The detail is the whole of what is known there, and a
	// separator in front of it reads as a sentence whose first half went missing.
	if (!title) {
		return isolateDirection(detail);
	}

	// the detail is rust's english prose whatever the locale, so it is isolated for the reason
	// `isolateDirection` states.
	return `${title} — ${isolateDirection(detail)}`;
}
