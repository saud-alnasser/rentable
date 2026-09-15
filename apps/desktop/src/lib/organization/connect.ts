import { toTauriErrorCode } from '$lib/error/tauri';
import type { LinkShape } from '$lib/platform/host';

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
 * **One field, and the kind is read off the link's own text** (effort 826, requirement 10; effort
 * 828, requirement 1). An organization link carries a legible credential and admits nobody by
 * itself, so a machine that records it stands at the wall. Every other link carries a payload
 * nothing opens without the code that came with it, so the screen names the organization, asks for
 * the code and the password, and the accept unseals, reaches, records and judges. Which kind it
 * is, is `linkKind` below, off the shape Rust decoded. *It was read off a standing Rust answered
 * by reaching the organization with the link's clear credential; there is no clear credential to
 * do that with, so reading a link is a decode.*
 *
 * **The connect runs on the organization's own link alone.** Every other link is recorded by the
 * act that takes the code, because the credential that reaches the organization is inside the
 * payload; a spent link still connects the machine that way, which is how a person setting up a
 * second machine gets to the wall rather than to a dead end.
 *
 * **The steps past the decode are ticket 05's.** This ticket moved the read and left the rest;
 * where a transition here still describes the standings Rust used to answer, its test is marked
 * for that ticket.
 *
 * **What the screen holds is the link text.** The credential the link carries is parsed on the
 * other side of the boundary and never read here ([[rules/credentials]], *Client boundary*); the
 * text is held only to try again with, and to hand back to the accept.
 */

/**
 * how many characters the confirmation code is (effort 826, requirement 23). Rust draws it from
 * an alphabet of thirty-two, digits and upper-case letters with `I`, `L`, `O` and `U` taken out,
 * so it is read out on a call without ambiguity; this side holds the length, because the field
 * bounds itself by it and the router refuses anything else before a round trip.
 */
export const CODE_LENGTH = 6;

/**
 * the code as the field holds it: upper-cased, with the spaces and hyphens a person reading one
 * out loud puts in taken off, and no longer than the code is. Rust upper-cases and trims again,
 * because the barrier is the derivation and not this.
 */
export function normalizeCode(typed: string): string {
	return typed
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.slice(0, CODE_LENGTH);
}

/**
 * which of the two the code was refused as. A code the row says has lapsed is `preconditionFailed`
 * and one that failed the seal is `forbidden`; both end with the same instruction, which is to ask
 * whoever invited for a fresh one, and each is said in the reader's own language here.
 */
export type CodeRefusal = 'wrong' | 'lapsed';

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
			/**
			 * whom the link invites, where the read could name them. Empty since effort 826's
			 * requirement 23: naming them meant opening their vault with the link's secret, and
			 * the secret is one half of what opens it now, so nobody is named until the code is
			 * typed and the accept has run. The screen draws the line only where there is one.
			 */
			username: string;
			/** the accept is running, which is three key derivations the person is waiting on. */
			isJoining: boolean;
			/**
			 * the code was refused, and which of the two it was: shown by name over the fields,
			 * with what the shell said under it.
			 */
			codeRefusal: CodeRefusal | null;
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
 * which kind of link this is, read from the link's own text. The decode says so directly now, so
 * this is a field read rather than a judgement; it is kept as a function because the screen and
 * the route both ask, and ticket 05 is where the third kind gets a step of its own.
 */
export function linkKind(shape: LinkShape): LinkShape['kind'] {
	return shape.kind;
}

/**
 * where the link leaves the screen, once it has been read: the wall for an organization link,
 * whose connect has already run, and the password for anything else, whose accept is what
 * reaches the organization at all.
 *
 * **Where a lapsed, consumed or revoked invitation lands is ticket 05's.** Nothing reads the row
 * before the code is typed, so those three arrive as refusals from the accept rather than from
 * the read, and `joinFailed` is where they will be keyed.
 */
export function afterConnect(link: string, shape: LinkShape): JoinStep | typeof THE_WALL {
	if (shape.kind === 'organization') {
		return THE_WALL;
	}

	return {
		kind: 'password',
		link,
		organizationName: shape.organizationName,
		// nobody is named from a link alone (effort 826, requirement 23), and the step stands
		// without a name: the organization is what the person recognises, and the code and the
		// password are what they have to give.
		username: '',
		isJoining: false,
		codeRefusal: null,
		errorMessage: null
	};
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
	return step.kind === 'password'
		? { ...step, isJoining: true, codeRefusal: null, errorMessage: null }
		: step;
}

/**
 * the accept was refused. The standings were judged before this step was reached, so what lands
 * here is a wrong or lapsed code, a link somebody altered, a password the floor refused, or a
 * standing that changed under the person.
 *
 * **The two code refusals are named in the reader's own language, and Rust's sentence is kept
 * under them.** A code that failed the seal is `forbidden` and one the row says has lapsed is
 * `preconditionFailed`, which are the two codes an accept reaching this step comes back with;
 * the rare third thing they can mean, a standing that changed while the person was typing, still
 * says so in Rust's own words on the line below, the way the refusal step shows a shell sentence
 * under its own. Everything else is shown as it was said.
 */
export function joinFailed(
	step: JoinStep,
	error: unknown,
	describe: (error: unknown) => string
): JoinStep {
	if (step.kind !== 'password') return step;

	const code = toTauriErrorCode(error);
	const codeRefusal: CodeRefusal | null =
		code === 'forbidden' ? 'wrong' : code === 'preconditionFailed' ? 'lapsed' : null;

	return { ...step, isJoining: false, codeRefusal, errorMessage: describe(error) };
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
