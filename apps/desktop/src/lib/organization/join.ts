import { toTauriErrorCode } from '$lib/error/tauri';
import type { LinkFacts } from '$lib/platform/host';

/**
 * CONNECTING BY A LINK
 *
 * what the connect screen is in, and how it moves: plain, so a `node:test` can drive every step
 * without a window, the way `layout/startup.ts` is driven.
 *
 * **A link arrives one of two ways, and the screen is the same for both.** The operating system
 * hands a `rentable://` link to the running process, or a person pastes one into the field; from
 * there the link is read in Rust, the organization it names is recorded on this machine, and what
 * follows is whichever of the two kinds of link it was. The paste is the fallback and not the
 * design: `tauri/src/organization/join.rs` records how the scheme reaches the application on each
 * platform.
 *
 * **One field, two kinds of link** (effort 826, requirement 10). An organization link names an
 * organization and admits nobody by itself, so a machine that records it stands at the wall. An
 * invitation link carries the half that opens one member's vault, so the screen names the
 * organization and the person, asks for the password they are choosing, and the accept signs them
 * in. Which kind it is, is read from the link rather than asked: `linkKind` below reads the
 * standing Rust answered with. *A link carried no invitation half at all between effort 824 and
 * this one, and the screen asked for no password.*
 *
 * **The connect runs on either kind, before the standing is judged.** `invitation_accept` refuses
 * a machine that holds no organization, so recording the organization is what makes an invitation
 * openable at all; and a spent link still names the organization, which is the way a person
 * setting up a second machine gets to the wall rather than to a dead end. So the order is read,
 * record, then judge, and a refusal is met by a machine that is already connected.
 *
 * **What the screen holds is the link text.** The credential the link carries is parsed on the
 * other side of the boundary and never read here ([[rules/credentials]], *Client boundary*); the
 * text is held only to try again with, and to hand back to the accept.
 */

/** which of the two kinds of link this is, once the organization it names has answered. */
export type LinkKind = 'organization' | 'invitation';

/**
 * why a link admits nobody: the three standings an invitation can be in and no longer open on,
 * and a link for an organization other than the one this machine holds.
 */
export type JoinRefusal = 'lapsed' | 'consumed' | 'revoked' | 'anotherOrganization';

export type JoinStep =
	/** no link yet: the field. */
	| { kind: 'paste' }
	/** the link is being read, and the organization it names recorded on this machine. */
	| { kind: 'inspecting'; link: string }
	/** the text is not a rentable link. */
	| { kind: 'unreadable'; link: string }
	/** the organization could not be reached from a machine that has never seen it. */
	| { kind: 'unreachable'; link: string; message: string }
	/**
	 * the link was read and this machine is connected, and it admits nobody: which of the four it
	 * is, and the shell's own sentence where a refusal came back from Rust rather than from the
	 * standing the inspection answered with.
	 */
	| { kind: 'refused'; link: string; refusal: JoinRefusal; message: string | null }
	/**
	 * an invitation that stands: whom it invites, where, and the password they are choosing. The
	 * link is held to hand back to the accept, which is what opens the vault.
	 */
	| {
			kind: 'password';
			link: string;
			organizationName: string;
			username: string;
			/** the accept is running, which is two key derivations the person is waiting on. */
			isJoining: boolean;
			errorMessage: string | null;
	  };

/**
 * what an organization link leads to, which is not a step: the machine is connected and nobody is
 * admitted yet, so the wall is what follows and the wall is the shell's. The route navigates and
 * this screen is done.
 */
export const THE_WALL = 'the wall';

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
 * which kind of link this is, read from what the organization answered rather than from the text.
 * `none` is the standing of the organization's own link, which carries no invitation half; every
 * other value is an invitation's, including the ones it no longer opens on. The invited username
 * is not the test: a consumed link carries a half whose secret opens nothing any more, and it is
 * still an invitation link.
 */
export function linkKind(facts: LinkFacts): LinkKind {
	return facts.standing === 'none' ? 'organization' : 'invitation';
}

/**
 * where the link leaves the screen, once it has been read and this machine connected: the wall for
 * an organization link, the password for an invitation that stands, and the refusal naming which
 * for one that does not.
 */
export function afterConnect(link: string, facts: LinkFacts): JoinStep | typeof THE_WALL {
	if (linkKind(facts) === 'organization') {
		return THE_WALL;
	}

	switch (facts.standing) {
		case 'open':
			return {
				kind: 'password',
				link,
				organizationName: facts.organizationName,
				// an open invitation whose secret opens nothing names nobody, and the accept is what
				// refuses it; the step still stands, since the person has nothing else to try.
				username: facts.invitation?.username ?? '',
				isJoining: false,
				errorMessage: null
			};
		case 'lapsed':
			return { kind: 'refused', link, refusal: 'lapsed', message: null };
		case 'consumed':
			return { kind: 'refused', link, refusal: 'consumed', message: null };
		default:
			return { kind: 'refused', link, refusal: 'revoked', message: null };
	}
}

/**
 * the link could not be read, or this machine could not be connected by it. Which of the three it
 * was is the Rust code on the rejection: text that is not a link is `invalidInput`, an
 * organization that could not be reached is `network`, and a machine already holding another
 * organization is `preconditionFailed`, whose sentence names both and says to disconnect first.
 * Anything else is shown as what it said.
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

	if (code === 'preconditionFailed') {
		return { kind: 'refused', link, refusal: 'anotherOrganization', message: describe(error) };
	}

	return { kind: 'unreachable', link, message: describe(error) };
}

/** the accept is out: the fields stay on screen, disabled, and nothing else moves. */
export function joinBegun(step: JoinStep): JoinStep {
	return step.kind === 'password' ? { ...step, isJoining: true, errorMessage: null } : step;
}

/**
 * the accept was refused. The standings were judged before this step was reached, so what lands
 * here is a link somebody altered, a password the floor refused, or a standing that changed under
 * the person; each is the shell's one sentence, said over the fields they can try again in.
 */
export function joinFailed(
	step: JoinStep,
	error: unknown,
	describe: (error: unknown) => string
): JoinStep {
	return step.kind === 'password'
		? { ...step, isJoining: false, errorMessage: describe(error) }
		: step;
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
