import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import z from 'zod';

/**
 * A USERNAME, AS ONE DEFINITION
 *
 * The one rule behind every field that takes a username: the owner's on the walk's `name` step,
 * a member's on the invite dialog, and the new one on the member's sheet. Each of those owns its
 * `<form>`, the first two through a `superForm` as the workspace surfaces do (`./workspace-form.ts`
 * says why), so what they share is this. A username outside the rule is then refused with the same sentence
 * wherever it was typed, and the rule changes in one place or not at all.
 *
 * **The rule is requirement 21's, and Rust holds it too.** Three to thirty-two characters of
 * letters, digits, `.`, `_` and `-`; `tauri/src/organization/invite.rs` carries the same bounds
 * as `validate_username` and refuses with `USERNAME_RULES`, which the locale's `usernameRules`
 * repeats word for word and `members.svelte.test.ts` pins. Whether a username is already taken
 * is Rust's alone, since usernames are sealed and only an open vault can compare them; that
 * refusal arrives as `BAD_REQUEST` and the shared handler shows it. The router's `USERNAME`
 * reads the three limits below so a caller that is not a form is turned away by the same rule.
 *
 * **Built from the translations rather than at module load**, for the reason the workspace form
 * gives: the sentence resolves against a locale, and at module load there is none.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** the username field's own schema, trimmed, refused with the one sentence on every bound. */
export function usernameSchema(translations: TranslationFunctions) {
	const rules = translations.organization.dashboard.usernameRules();

	return z
		.string()
		.trim()
		.min(USERNAME_MIN, { message: rules })
		.max(USERNAME_MAX, { message: rules })
		.regex(USERNAME_PATTERN, { message: rules });
}
