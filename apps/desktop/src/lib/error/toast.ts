import type { TranslationFunctions } from '$lib/i18n/i18n-types';

import { toErrorMessage } from '$lib/error/message';
import { toast } from 'svelte-sonner';

/**
 * show a thrown value as an error toast, with the sentence as the title and
 * rust's prose — where there is any — as the description.
 *
 * for failures raised outside a mutation. a mutation reports through the shared
 * handlers in `$lib/design/mutation` instead.
 */
export function showErrorToast(error: unknown, translations: TranslationFunctions) {
	const { title, detail } = toErrorMessage(error, translations);

	toast.error(title, { description: detail ?? undefined });
}
