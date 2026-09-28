import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toErrorMessage } from '$lib/error/message';
import { toRefusalText } from '$lib/error/refusal';
import { toTauriErrorCode } from '$lib/error/tauri';
import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { toRefusal } from '@rentable/design/confirmation.js';
import { toast, type ExternalToast } from 'svelte-sonner';

/**
 * WHERE A TOAST IS RAISED
 *
 * This module is the only one that imports `toast`, and `notification/tests/reach.test.ts` fails
 * on a second. A mutation reports through the handlers in `$lib/mutation`, which raise
 * through {@link notify}; everything else a surface has to announce, which is a failure raised
 * outside a mutation or a success that no mutation stands behind, comes through the functions
 * below it.
 *
 * *Why one path: a surface calling `toast` itself decides its own tone, duration and wording
 * rules, and the application had several that did, each a little differently.*
 */

/** what a toast is identified by, so the one carrying an offer can be withdrawn. */
export type NotificationId = string | number;

/**
 * the toaster itself, for the mutation handlers that decide a toast's tone, detail, offer and
 * duration from a declaration. A surface does not reach for it: it announces through the
 * functions below, or through the declaration of the mutation it calls.
 */
export const notify = {
	success: (title: string, options?: ExternalToast): NotificationId =>
		toast.success(title, options),
	warning: (title: string): NotificationId => toast.warning(title),
	error: (title: string): NotificationId => toast.error(title),
	dismiss: (id: NotificationId) => {
		toast.dismiss(id);
	}
};

/**
 * show a thrown value as an error toast: the reader's sentence, and nothing else.
 *
 * **What the shell said behind it goes to diagnostics, not the toast.** It is the machine's
 * English whatever the reader's language ([[rules/interface]], *Error*), and a toast is read and
 * gone with no room for a disclosure to open in. Nobody acts on those words; they are what a person
 * quotes when asked what happened, and the diagnostics file is where that question is answered.
 *
 * for failures raised outside a mutation. a mutation reports through the shared
 * handlers in `$lib/mutation` instead.
 */
export function showErrorToast(error: unknown, translations: TranslationFunctions) {
	const { title, detail } = toErrorMessage(error, translations);

	if (detail) {
		recordDiagnosticError('toast.failed', { code: toTauriErrorCode(error), detail });
	}

	showErrorSentence(title);
}

/**
 * show a sentence the surface already has in the reader's language as an error toast.
 *
 * for a refusal decided in the interface rather than thrown, where there is no value to decode.
 */
export function showErrorSentence(title: string) {
	toast.error(title);
}

/**
 * announce something that went through, where no mutation stands behind it: a file written, an
 * update found to be current. A mutation's success is announced by its declaration.
 */
export function showSuccessToast(title: string, detail?: string | null) {
	toast.success(title, { description: detail ?? undefined });
}

/**
 * show the refusal an act earned where no confirmation was open to hold it: a delete that ran at
 * once ([[rules/interface]], *Delete and confirm*).
 *
 * The same reading the confirmation dialogs make (`toRefusal`): a `BAD_REQUEST` is a refusal
 * and is shown in the reader's words (`toRefusalText`), anything else is a fault the mutation's own declaration
 * has already reported, and is not raised twice.
 */
export function showRefusal(error: unknown, translations: TranslationFunctions) {
	const refusal = toRefusal(error, translations.common.messages.unexpectedError(), (failure) =>
		toRefusalText(failure, translations)
	);

	if (refusal) {
		showErrorSentence(refusal);
	}
}
