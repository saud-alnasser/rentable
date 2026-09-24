import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toErrorMessage } from '$lib/error/message';
import { toRefusal } from '@rentable/design/confirmation.js';
import { toast } from 'svelte-sonner';

/**
 * WHERE A TOAST IS RAISED
 *
 * This module and `$lib/design/mutation` are the only two that import `toast`, and
 * `error/tests/toast-reach.test.ts` fails on a third. A mutation reports through the handlers in
 * `$lib/design/mutation`; everything else a surface has to announce, which is a failure raised
 * outside a mutation or a success that no mutation stands behind, comes through here.
 *
 * *Why one path: a surface calling `toast` itself decides its own tone, duration and wording
 * rules, and the application had several that did, each a little differently.*
 */

/**
 * show a thrown value as an error toast, with the sentence as the title and
 * rust's prose, where there is any, as the description.
 *
 * for failures raised outside a mutation. a mutation reports through the shared
 * handlers in `$lib/design/mutation` instead.
 */
export function showErrorToast(error: unknown, translations: TranslationFunctions) {
	const { title, detail } = toErrorMessage(error, translations);

	showErrorSentence(title, detail);
}

/**
 * show a sentence the surface already has in the reader's language as an error toast.
 *
 * for a refusal decided in the interface rather than thrown, where there is no value to decode.
 */
export function showErrorSentence(title: string, detail?: string | null) {
	toast.error(title, { description: detail ?? undefined });
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
 * The same reading the confirmation dialogs make (`toRefusal`): a `BAD_REQUEST` is a sentence
 * written for the reader and is shown, anything else is a fault the mutation's own declaration
 * has already reported, and is not raised twice.
 */
export function showRefusal(error: unknown, translations: TranslationFunctions) {
	const refusal = toRefusal(error, translations.common.messages.unexpectedError());

	if (refusal) {
		showErrorSentence(refusal);
	}
}
