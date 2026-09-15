import { toTauriErrorCode, toTauriRefusalReason } from '$lib/error/tauri';
import type { LinkShape } from '$lib/platform/host';

/**
 * CONNECTING BY A LINK
 *
 * what the connect screen is in, and how it moves: plain, so a `node:test` can drive every step
 * without a window, the way `layout/startup.ts` is driven.
 *
 * **A link arrives one of two ways, and the screen is the same for both.** The operating system
 * hands a `rentable://` link to the running process, or a person pastes one into the field; either
 * way it waits there for the code that came with it, and then the link is read in Rust, the
 * organization it names is recorded on this machine, and what follows is whichever kind of link it
 * was. The paste is the fallback and not the design: `tauri/src/organization/join.rs` records how
 * the scheme reaches the application on each platform.
 *
 * **One form, the link and its code, and the kind is read off the link's own text** (effort 826,
 * requirement 10; effort 828, requirements 1, 16 and 17). Every link carries a payload nothing
 * opens without the code that came with it, so the two halves are asked for together and nothing
 * is read before both are in hand. There are two kinds and each has its own way on. A second
 * machine's link is connected with the code in the same wait, and its member's own password is
 * what the wall then asks for. An invitation link is the
 * one that asks for anything more: the screen names the organization and takes the password this
 * person is choosing, and the accept unseals, reaches, records and judges. Which kind it is, is
 * `linkKind` below, off the shape Rust decoded. *It was read off a standing Rust answered by
 * reaching the organization with the link's clear credential; there is no clear credential to do
 * that with, so reading a link is a decode.*
 *
 * **There is no way through this screen that does not spend a code.** A third kind, the
 * organization's own link, carried a legible credential and ran a connect of its own with nothing
 * asked for; requirement 16 retired it, because the owner's Turso account is what recovers an
 * organization whose every machine is gone. Every link left is recorded by the act that takes the
 * code, since the credential that reaches the organization is inside the payload; a spent link
 * still connects the machine that way, which is how a person setting up a second machine gets to
 * the wall rather than to a dead end.
 *
 * **Nothing is judged before the code, so every standing arrives as a refusal.** A lapsed,
 * consumed, revoked or replaced link comes back from the accept or the machine connect rather than
 * from the read, and Rust names which on the rejection's own `reason` (`refused`, in
 * `error/tauri.ts`). `joinFailed` is where that word becomes the step a person lands on, and the
 * sentence they read is this side's, said in their language. *The screen read the standing off the
 * link before anybody typed anything until effort 828 sealed the credential.*
 *
 * **A refusal a person can answer marks the field it belongs to** ([[rules/interface]],
 * *Validation errors*): text that is not a link marks the link, and a code the seal refused marks
 * the code, both on the form that took the two. Everything else is the link's own standing, which
 * no field can fix, and is a step of its own.
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
	/**
	 * the one form: the link and the code that came with it, and whichever of the two a refusal
	 * belongs to, marked. It is where the screen starts and where every refusal a person can
	 * answer without a new link comes back to.
	 */
	| {
			kind: 'paste';
			/** the link's text, held so a refusal hands back a form the person can correct. */
			link: string;
			code: string;
			/** the text is not a rentable link, which marks the link field. */
			isUnreadable: boolean;
			/**
			 * the code was refused, and which of the two it was: the code field is marked, and what
			 * the shell said is kept under it.
			 */
			codeRefusal: CodeRefusal | null;
			errorMessage: string | null;
	  }
	/**
	 * the link's text is being read, and the act the read names runs in the same wait: the machine
	 * connect, on a link a member made for this machine. The code is held through it, because the
	 * act is what spends it.
	 */
	| { kind: 'reading'; link: string; code: string }
	/** the organization could not be reached from a machine that has never seen it. */
	| { kind: 'unreachable'; link: string; code: string; message: string }
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
	 * an invitation that was read: which organization, and the password this person is choosing.
	 * The link and the code they already gave are held to hand back to the accept, which is what
	 * opens the vault.
	 *
	 * **The two password fields and nothing else** (effort 828, requirement 17). The code was
	 * typed on the form that took the link, so this step asks for the one thing the link cannot
	 * carry; a code the accept refuses hands the whole form back rather than asking for the code
	 * twice.
	 *
	 * **Nobody is named on it.** Naming the invited person meant opening their vault with the
	 * link's secret, and the secret is one half of what opens it now (effort 826, requirement 23),
	 * so there is nothing to name before the accept has run. The organization is what the person
	 * recognises.
	 */
	| {
			kind: 'password';
			link: string;
			code: string;
			organizationName: string;
			/** the accept is running, which is three key derivations the person is waiting on. */
			isJoining: boolean;
			errorMessage: string | null;
	  };

/** the form as nobody has answered it yet, or as a refusal hands it back with its fields filled. */
export function pasting(link = '', code = ''): Extract<JoinStep, { kind: 'paste' }> {
	return { kind: 'paste', link, code, isUnreadable: false, codeRefusal: null, errorMessage: null };
}

/**
 * what a link that connected the machine leads to, which is not a step: the machine is connected
 * and nobody is admitted yet, so the wall is what follows and the wall is the shell's. The route
 * navigates and this screen is done.
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

/**
 * where the screen starts: the form, with the link already in it where one was handed over.
 *
 * **A link that arrived on its own is still a form to answer** (effort 828, requirement 17). The
 * code is the half nothing else can supply, so a link the operating system handed over waits in
 * the field for it rather than being read straight through; the person types the six characters
 * they were read out and continues, exactly as the person who pasted the link does. *It read the
 * link at once while a link opened something by itself.*
 */
export function beginWith(link: string | null): JoinStep {
	return pasting(normalizeLink(link ?? ''));
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
 * where the link leaves the read, which is one of two places: the wall, for the link whose act has
 * already run in the same wait, and the password for an invitation, whose accept is what reaches
 * the organization at all.
 *
 * **A machine link ends at the wall and admits nobody.** It was connected with the code the form
 * already took (effort 828, requirement 17), and the password that member already has is the
 * wall's to ask for. *The machine link asked for its code on a step of its own until the form took
 * both halves at once, and the organization's own link ended here too, with no code asked for at
 * all, until requirement 16 retired it.*
 *
 * The password step carries the organization's name off the shape, because that is the one thing
 * the person on the new machine can recognise, and nothing else the link said is worth drawing.
 */
export function afterRead(
	link: string,
	code: string,
	shape: LinkShape
): JoinStep | typeof THE_WALL {
	if (shape.kind !== 'invitation') {
		return THE_WALL;
	}

	return {
		kind: 'password',
		link,
		code,
		organizationName: shape.organizationName,
		isJoining: false,
		errorMessage: null
	};
}

/**
 * the link could not be read. Which of the three it was is the Rust code on the rejection: text
 * that is not a link is `invalidInput`, which a link in the shape before effort 828 is; an
 * organization that could not be reached is `network`; and a machine already holding another
 * organization is `preconditionFailed`, whose sentence names both and says to disconnect first.
 * Anything else is shown as what it said.
 *
 * **A decode refusal marks the link field**, on the form the person is already looking at, with
 * the code they typed still in it: the link is the half that is wrong, and saying so anywhere but
 * on the field leaves them to work out which of the two to correct ([[rules/interface]],
 * *Validation errors*). *It was a step of its own until the form took both halves.*
 *
 * **It answers nothing about where a link stands**, which is what narrowed it to the decode. No
 * row has been looked at by the time anything here runs; a lapsed, consumed, revoked or replaced
 * link is `joinFailed`'s to land, after the code has been spent.
 */
export function inspectionFailed(
	link: string,
	code: string,
	error: unknown,
	describe: (error: unknown) => string
): JoinStep {
	const failure = toTauriErrorCode(error);

	if (failure === 'invalidInput') {
		return { ...pasting(link, code), isUnreadable: true };
	}

	if (failure === 'preconditionFailed') {
		return { kind: 'refused', link, refusal: 'anotherOrganization', message: describe(error) };
	}

	return { kind: 'unreachable', link, code, message: describe(error) };
}

/**
 * the accept is out: the fields stay on screen, disabled, and nothing else moves.
 */
export function joinBegun(step: JoinStep): JoinStep {
	return step.kind === 'password' ? { ...step, isJoining: true, errorMessage: null } : step;
}

/**
 * an act that spent the code was refused, and this is the one place a standing becomes a step.
 * Nothing reads a row before the code is out, so everything a link can be wrong about lands here
 * rather than on the read: the accept, on the password step, and the connect and the machine
 * connect, in the wait the read runs in.
 *
 * **Where each goes, and what says so.** A link the row refuses carries Rust's `reason`, which is
 * `lapsed`, `consumed`, `revoked` or `replaced`, and lands by that name on the refused step with
 * Rust's sentence kept under this side's. A link for an organization this machine does not hold is
 * `preconditionFailed` and is the fifth refusal. A code that failed the seal is `forbidden` and a
 * code nobody typed is `invalidInput`, and both hand the form back with the code field marked,
 * since the field is where the person answers them (effort 828, requirement 17). A connection that
 * went is `network` and is the unreachable step, which offers the same link again. Anything else
 * keeps the person where they were and is shown as it was said.
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
	if (step.kind !== 'password' && step.kind !== 'reading') return step;

	const failure = toTauriErrorCode(error);
	const message = describe(error);
	const reason = toTauriRefusalReason(error);

	if (reason) {
		return { kind: 'refused', link: step.link, refusal: reason, message };
	}

	if (failure === 'preconditionFailed') {
		return { kind: 'refused', link: step.link, refusal: 'anotherOrganization', message };
	}

	if (failure === 'network') {
		return { kind: 'unreachable', link: step.link, code: step.code, message };
	}

	// what the person typed, which is the one refusal they can answer without a new link, so the
	// form comes back with the code field marked and both halves still in it. A rarer
	// `invalidInput`, a password under the floor or a link carrying no invitation, keeps Rust's own
	// sentence on the line below, which is where the exact reason is read.
	const codeRefusal: CodeRefusal | null =
		failure === 'forbidden' ? 'wrong' : failure === 'invalidInput' ? 'missing' : null;

	// a failure the boundary did not name leaves the person choosing their password where they
	// were, because nothing about the fields they are filling in is wrong.
	if (!codeRefusal && step.kind === 'password') {
		return { ...step, isJoining: false, errorMessage: message };
	}

	return { ...pasting(step.link, step.code), codeRefusal, errorMessage: message };
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
