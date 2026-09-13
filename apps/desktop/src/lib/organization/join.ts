import { toTauriErrorCode } from '$lib/error/tauri';

/**
 * CONNECTING BY A LINK
 *
 * what the connect screen is in, and how it moves: plain, so a `node:test` can drive every step
 * without a window, the way `layout/startup.ts` is driven.
 *
 * **A link arrives one of two ways, and the screen is the same for both.** The operating system
 * hands a `rentable://` link to the running process, or a person pastes one into the field; from
 * there the link is read in Rust, the organization it names is recorded on this machine, and the
 * person stands at the wall, where a username and a password admit them. The paste is the
 * fallback and not the design: `tauri/src/organization/join.rs` records how the scheme reaches
 * the application on each platform.
 *
 * **A link carries no invitation half, and the screen asks for no password.** It did both until
 * effort 824 retired 819's join and restore as ways through the wall: a link now says where an
 * organization is, and being admitted to it is the wall's business. So the steps are the four
 * a read can end in, and nothing after a link that was read, since the wall is what follows.
 *
 * **What the screen holds is the link text.** The credential the link carries is parsed on the
 * other side of the boundary and never read here ([[rules/credentials]], *Client boundary*); the
 * text is held only to try again with.
 */

export type JoinStep =
	/** no link yet: the field. */
	| { kind: 'paste' }
	/** the link is being read, and the organization it names recorded on this machine. */
	| { kind: 'inspecting'; link: string }
	/** the text is not a rentable link. */
	| { kind: 'unreadable'; link: string }
	/** the organization could not be reached from a machine that has never seen it. */
	| { kind: 'unreachable'; link: string; message: string };

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
