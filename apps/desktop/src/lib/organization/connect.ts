import { toTauriErrorCode, toTauriRefusalReason } from '$lib/error/tauri';
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
 * 828, requirements 1 and 3). There are three kinds and each has its own way on. An organization
 * link carries a legible credential and admits nobody by itself, so a machine that records it
 * stands at the wall. An invitation link carries a payload nothing opens without the code that
 * came with it, so the screen names the organization, asks for the code and the password, and the
 * accept unseals, reaches, records and judges. A second machine's link carries the same kind of
 * payload and no password, because the member already has one, so the screen asks for the code
 * alone and the machine connect judges. Which kind it is, is `linkKind` below, off the shape Rust
 * decoded. *It was read off a standing Rust answered by reaching the organization with the link's
 * clear credential; there is no clear credential to do that with, so reading a link is a decode.*
 *
 * **The connect runs on the organization's own link alone.** Every other link is recorded by the
 * act that takes the code, because the credential that reaches the organization is inside the
 * payload; a spent link still connects the machine that way, which is how a person setting up a
 * second machine gets to the wall rather than to a dead end.
 *
 * **Nothing is judged before the code, so every standing arrives as a refusal.** A lapsed,
 * consumed, revoked or replaced link comes back from the accept or the machine connect rather than
 * from the read, and Rust names which on the rejection's own `reason` (`refused`, in
 * `error/tauri.ts`). `joinFailed` is where that word becomes the step a person lands on, and the
 * sentence they read is this side's, said in their language. *The screen read the standing off the
 * link before anybody typed anything until effort 828 sealed the credential.*
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
 * which of the two the code was refused as. A code that failed the seal is `forbidden`, and a field
 * nobody filled in is `invalidInput`; both are about what the person typed rather than about the
 * link, both end with the same instruction, and each is said in the reader's own language here.
 *
 * *`lapsed` was the second of these while a code had a life of its own. A code now lives exactly
 * as long as its link (effort 828, requirement 1), so a link past its moment is a refused link and
 * not a stale code.*
 */
export type CodeRefusal = 'wrong' | 'missing';

/**
 * why a link admits nobody: the standings a link can be in and no longer open on, and a link for
 * an organization other than the one this machine holds.
 *
 * The first four are Rust's `RefusalReason`, spelled the same, and arrive on a rejection the
 * accept or the machine connect answered with; `replaced` is a second machine's alone, and means
 * the member made a newer link. The fifth is the connect's, and is the only one a link can meet
 * before any code is typed.
 */
export type JoinRefusal = 'lapsed' | 'consumed' | 'revoked' | 'replaced' | 'anotherOrganization';

export type JoinStep =
	/** no link yet: the field. */
	| { kind: 'paste' }
	/**
	 * the link's text is being read. A decode and nothing behind it, except on the organization's
	 * own link, where the connect that records the organization runs in the same wait.
	 */
	| { kind: 'reading'; link: string }
	/** the text is not a rentable link. */
	| { kind: 'unreadable'; link: string }
	/** the organization could not be reached from a machine that has never seen it. */
	| { kind: 'unreachable'; link: string; message: string }
	/**
	 * the link admits nobody: which of the five it is, and the shell's own sentence under it,
	 * since a standing that changed while the person was typing is worth reading in Rust's words.
	 *
	 * **This machine may or may not be connected here.** A code that was right unsealed the
	 * credential and reached the organization before the row was judged, so a spent link lands the
	 * machine connected and the wall is its way on; a lapsed link is refused before any key is
	 * derived and reaches nothing.
	 */
	| { kind: 'refused'; link: string; refusal: JoinRefusal; message: string | null }
	/**
	 * an invitation that was read: which organization, the code the issuer read out, and the
	 * password this person is choosing. The link is held to hand back to the accept, which is what
	 * opens the vault.
	 *
	 * **Nobody is named on it.** Naming the invited person meant opening their vault with the
	 * link's secret, and the secret is one half of what opens it now (effort 826, requirement 23),
	 * so there is nothing to name before the accept has run. The organization is what the person
	 * recognises.
	 */
	| {
			kind: 'password';
			link: string;
			organizationName: string;
			/** the accept is running, which is three key derivations the person is waiting on. */
			isJoining: boolean;
			/**
			 * the code was refused, and which of the two it was: shown by name over the fields,
			 * with what the shell said under it.
			 */
			codeRefusal: CodeRefusal | null;
			errorMessage: string | null;
	  }
	/**
	 * a link the member made for this machine (effort 828, requirement 3): the code alone, because
	 * the password they already have is what the wall asks for once the machine is connected.
	 */
	| {
			kind: 'code';
			link: string;
			organizationName: string;
			/** the machine connect is running, which is the key derivation and the first pull. */
			isJoining: boolean;
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

	return normalized ? { kind: 'reading', link: normalized } : { kind: 'paste' };
}

/**
 * which kind of link this is, read from the link's own text. The decode says so directly, so this
 * is a field read rather than a judgement; it is kept as a function because the screen and the
 * route both ask, and because where the answer comes from is worth naming once.
 */
export function linkKind(shape: LinkShape): LinkShape['kind'] {
	return shape.kind;
}

/**
 * where the link leaves the read, which is one of three places: the wall for an organization link,
 * whose connect has already run and which admits nobody by itself; the password for an invitation,
 * whose accept is what reaches the organization at all; and the code alone for a second machine's
 * link, whose member already has a password and meets it at the wall afterwards.
 *
 * Each carries the organization's name off the shape, because that is the one thing the person on
 * the new machine can recognise, and nothing else the link said is worth drawing before a code is
 * typed.
 */
export function afterRead(link: string, shape: LinkShape): JoinStep | typeof THE_WALL {
	if (shape.kind === 'organization') {
		return THE_WALL;
	}

	return {
		kind: shape.kind === 'machine' ? 'code' : 'password',
		link,
		organizationName: shape.organizationName,
		isJoining: false,
		codeRefusal: null,
		errorMessage: null
	};
}

/**
 * the link could not be read, or the organization's own link could not connect this machine. Which
 * of the three it was is the Rust code on the rejection: text that is not a link is `invalidInput`,
 * which a link in the shape before effort 828 is; an organization that could not be reached is
 * `network`; and a machine already holding another organization is `preconditionFailed`, whose
 * sentence names both and says to disconnect first. Anything else is shown as what it said.
 *
 * **It answers nothing about where a link stands**, which is what narrowed it to the decode. The
 * read is a decode and the connect is the organization's own link alone, so no row has been looked
 * at by the time anything here runs; a lapsed, consumed, revoked or replaced link is `joinFailed`'s
 * to land, after a code.
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

/**
 * the act that takes the code is out: the fields stay on screen, disabled, and nothing else moves.
 * Both steps that take a code are held the same way.
 */
export function joinBegun(step: JoinStep): JoinStep {
	return step.kind === 'password' || step.kind === 'code'
		? { ...step, isJoining: true, codeRefusal: null, errorMessage: null }
		: step;
}

/**
 * the accept or the machine connect was refused, and this is the one place a standing becomes a
 * step. Nothing reads a row before the code is out, so everything a link can be wrong about lands
 * here rather than on the read.
 *
 * **Where each goes, and what says so.** A link the row refuses carries Rust's `reason`, which is
 * `lapsed`, `consumed`, `revoked` or `replaced`, and lands by that name on the refused step with
 * Rust's sentence kept under this side's. A link for an organization this machine does not hold is
 * `preconditionFailed` and is the fifth refusal. A code that failed the seal is `forbidden` and a
 * code nobody typed is `invalidInput`, and both stay on the step so the person can try the field
 * again. A connection that went is `network` and is the unreachable step, which offers the same
 * link again. Anything else stays on the step and is shown as it was said.
 *
 * *Every one of those but the network came back as one `forbidden` until effort 828, and the
 * screen could not tell a mistyped code from a dead link. The refusal now crosses the boundary as
 * a named code, which is what this reads; nothing here reads a sentence.*
 */
export function joinFailed(
	step: JoinStep,
	error: unknown,
	describe: (error: unknown) => string
): JoinStep {
	if (step.kind !== 'password' && step.kind !== 'code') return step;

	const code = toTauriErrorCode(error);
	const message = describe(error);
	const reason = toTauriRefusalReason(error);

	if (reason) {
		return { kind: 'refused', link: step.link, refusal: reason, message };
	}

	if (code === 'preconditionFailed') {
		return { kind: 'refused', link: step.link, refusal: 'anotherOrganization', message };
	}

	if (code === 'network') {
		return { kind: 'unreachable', link: step.link, message };
	}

	// what the person typed, which is the one refusal they can answer without a new link. A rarer
	// `invalidInput`, a password under the floor or a link carrying no invitation, keeps Rust's own
	// sentence on the line below, which is where the exact reason is read.
	const codeRefusal: CodeRefusal | null =
		code === 'forbidden' ? 'wrong' : code === 'invalidInput' ? 'missing' : null;

	return { ...step, isJoining: false, codeRefusal, errorMessage: message };
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
