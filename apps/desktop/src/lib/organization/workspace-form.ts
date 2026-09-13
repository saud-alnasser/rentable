import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace';
import z from 'zod';

/**
 * NAMING A WORKSPACE, AS ONE DEFINITION
 *
 * The one schema behind every surface that asks for a workspace's name: the no-workspace
 * surface a member meets when their organization holds none yet, the first run's last step, and
 * the new-workspace dialog. Each of those owns its `superForm` and its `<form>`, because the form
 * surface owns one and the standalone surface does not, so what they share is this and the fields
 * in `component/workspace-fields.svelte`. A name over the limit is then refused with the same
 * sentence wherever it was typed, and the limit changes in one place or not at all.
 *
 * **Built from the translations rather than at module load**, for the reason
 * `workspace/component/rename-form.svelte` gives: the messages resolve against a locale, and at
 * module load there is none. A consumer calls this when it is built, which is past the locale gate.
 */
export function workspaceFormSchema(translations: TranslationFunctions) {
	return z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: translations.workspace.nameRequired() })
			.max(WORKSPACE_NAME_LIMIT, { message: translations.workspace.nameTooLong() })
	});
}

export type WorkspaceForm = z.infer<ReturnType<typeof workspaceFormSchema>>;
