import type { LinkFacts } from '$lib/platform/host';

import { toTauriErrorCode } from '$lib/error/tauri';

/**
 * JOINING BY A LINK
 *
 * what the join screen is in, and how it moves: plain, so a `node:test` can drive every step
 * without a window, the way `layout/startup.ts` is driven.
 *
 * **A link arrives one of two ways, and the screen is the same for both.** The operating system
 * hands a `rentable://` link to the running process, or a person pastes one into the field; from
 * there the link is read in Rust, the organization is named, and the invitation is either open,
 * which asks for the password, or not, which says which of the three it is. The paste is the
 * fallback and not the design: `tauri/src/organization/join.rs` records how the scheme reaches
 * the application on each platform.
 *
 * **What the screen holds is the link text and facts about it.** The credential the link carries
 * and the secret in it are parsed on the other side of the boundary and never read here
 * ([[rules/credentials]], *Client boundary*); the text is held only to hand back with the
 * password.
 */

export type JoinStep =
	/** no link yet: the field. */
	| { kind: 'paste' }
	/** the link is being read against the organization it names. */
	| { kind: 'inspecting'; link: string }
	/** the text is not a rentable link. */
	| { kind: 'unreadable'; link: string }
	/** the organization could not be reached from a machine that has never seen it. */
	| { kind: 'unreachable'; link: string; message: string }
	/** the link found the organization, and the invitation is not one a password opens. */
	| { kind: 'refused'; link: string; facts: LinkFacts }
	/** the invitation is open: the password. */
	| { kind: 'password'; link: string; facts: LinkFacts }
	/**
	 * the organization's own link, with no invitation in it: a place already held is restored
	 * on this machine by the email and the password (requirement 6).
	 */
	| { kind: 'restore'; link: string; facts: LinkFacts };

/**
 * a pasted link, as a person pastes one: with the whitespace, quotes and angle brackets a chat
 * client or a mail client wraps a link in, taken off. What a link is, is Rust's to decide.
 */
export function normalizeLink(text: string): string {
	return text
		.trim()
		.replace(/^[<"'`“‘]+/, '')
		.replace(/[>"'`”’.,;]+$/, '')
		.trim();
}

/** where the screen starts: reading the link it was given, or asking for one. */
export function beginWith(link: string | null): JoinStep {
	const normalized = normalizeLink(link ?? '');

	return normalized ? { kind: 'inspecting', link: normalized } : { kind: 'paste' };
}

/** the link was read: an open invitation asks for the password; anything else is refused by name. */
export function inspected(link: string, facts: LinkFacts): JoinStep {
	if (facts.standing === 'open') return { kind: 'password', link, facts };
	if (facts.standing === 'none') return { kind: 'restore', link, facts };

	return { kind: 'refused', link, facts };
}

/**
 * the link could not be read. Which of the two it was is the Rust code on the rejection: text
 * that is not a link is `invalidInput`, and an organization that could not be reached is
 * `network`; anything else is shown as what it said.
 */
export function inspectionFailed(
	link: string,
	error: unknown,
	describe: (error: unknown) => string
): JoinStep {
	const code = toTauriErrorCode(error);

	if (code === 'invalidInput') {
		return { kind: 'unreadable', link };
	}

	return { kind: 'unreachable', link, message: describe(error) };
}

/**
 * the link the operating system handed over, held between the shell that received it and the
 * screen that reads it. One at a time, and taken once: a screen that read it does not read it
 * again on its next mount, and a second link replaces a first nobody opened.
 */
let arriving: string | null = null;

export function linkArrived(link: string) {
	arriving = link;
}

export function takeArrivingLink(): string | null {
	const link = arriving;

	arriving = null;

	return link;
}
