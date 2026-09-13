/**
 * The two letters an avatar shows where there is no picture: the first two characters of the
 * username, upper-cased.
 *
 * A username is one word, so there is no second word to take an initial from; the pair is read
 * off the front of the one word. A string shorter than two is padded with the fallback rather
 * than thrown on, because the avatar draws a disc of a fixed size either way. A valid username is
 * at least three characters, so the padding is defensive.
 *
 * *This took the first letter of each of the first two words while an account carried a display
 * name (`Ada Lovelace` drew `AL`); a username has no space in it, so `ada.lovelace` draws `AD`.
 * `signedInAccount` lived beside this until the control plane retired: an account was a row the
 * machine held for Google, and who is in is the organization session now, read where the shell
 * holds it (`organization/query.ts::useFetchOrganizationState`).*
 */
export function accountInitials(source: string | null | undefined, fallback = '?'): string {
	return Array.from((source ?? '').trim())
		.slice(0, 2)
		.join('')
		.toUpperCase()
		.padEnd(2, fallback);
}
