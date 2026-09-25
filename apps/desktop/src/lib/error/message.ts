import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { isRefusal, toRefusalText } from '$lib/error/refusal';
import { toTauriErrorCode } from '$lib/error/tauri';
import { TRPCError } from '@trpc/server';

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
 * render a thrown value for the user. a refusal a procedure raised is titled from
 * its code (`error/refusal.ts`), and so is one the shell raised with a reason, with
 * nothing beside it: the reason is the whole of what the reader needs, and rust's
 * message is a developer's description a screen shows only behind a disclosure,
 * through `toErrorDetail`. any other failure that crossed the tauri boundary is
 * titled from its code so it is translated, and rust's untranslated prose is
 * kept as detail rather than discarded, since it is the only description of what
 * actually went wrong. a failure a router raised that is not a refusal, a
 * permission failure, an input its schema turned away or anything unexpected, is
 * titled from its code with nothing beside it (`toRouterFailureText`), since its
 * message was written for a developer. anything else raised inside typescript is
 * already written in the user's language, so it is shown as it was written.
 *
 * **The detail is never visible text.** It is the machine's English whatever the reader's
 * language, so a surface puts it behind `error/component/detail-disclosure.svelte` or sends it to
 * diagnostics, and never beside the title ([[rules/interface]], *Error*).
 *
 * `fallback` replaces the generic message when there is nothing readable at all,
 * for callers that can say something more useful about where the failure was.
 */
export function toErrorMessage(
	error: unknown,
	translations: TranslationFunctions,
	fallback?: string
): ErrorMessage {
	// a refusal is a code, from a procedure or the shell, and its message is a developer's
	// description.
	if (isRefusal(error)) {
		return { title: toRefusalText(error, translations), detail: null };
	}

	const code = toTauriErrorCode(error);

	if (code) {
		return { title: translations.common.errors[code](), detail: toErrorDetail(error) };
	}

	// a router's failure that is not a refusal: its message is a developer's description, written
	// in English for a log, so it is titled from its code and carries nothing beside it.
	if (error instanceof TRPCError) {
		return { title: toRefusalText(error, translations), detail: null };
	}

	return {
		title: toErrorDetail(error) ?? fallback ?? translations.common.messages.unexpectedError(),
		detail: null
	};
}

/**
 * `toErrorMessage`'s title alone, for the places that render a single string. The detail is left
 * out rather than joined on: it is the shell's English, and a surface with room for it reads it
 * from `toErrorMessage` and puts it behind the details disclosure.
 */
export function toErrorText(
	error: unknown,
	translations: TranslationFunctions,
	fallback?: string
): string {
	const { title, detail } = toErrorMessage(error, translations, fallback);

	// a title with nothing in it is a translation that is not loaded, which happens on the one
	// screen drawn before a locale is (`layout/component/startup-unreadable.svelte`). No reader's
	// language exists there to translate into, and the detail is the whole of what is known, so it
	// is what that screen says, isolated for the reason `isolateDirection` states.
	if (!title && detail) {
		return isolateDirection(detail);
	}

	return title;
}
