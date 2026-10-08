import type { RemoteSyncState } from '$lib/sync';
import type { Recovery } from '$lib/update';
import type { OrganizationState } from '$lib/organization';

/**
 * What startup draws the shell from: the states it can be in, why the wall is up, and the one
 * snapshot every surface reads. Only the unit (`./machine`) writes it.
 */

/**
 * *`choose-workspace` went with Google Drive sync (decision 07). It offered two things, open the
 * workspace kept on this machine or link a Drive folder, and there is one workspace, created at
 * sign-up, with nothing to choose between.*
 *
 * **`no-workspace` arrived with organizations.** A member is admitted by their password, and what
 * they are admitted to is whichever workspaces they hold a grant on; an organization whose owner
 * has not created one yet admits its members to nothing, which is a state of its own rather than a
 * failure to start. Creating one is the workspace ticket's; this state is where that surface goes.
 */
export type StartupState =
	'loading' | 'sign-in' | 'no-workspace' | 'held' | 'ready' | 'error' | 'recovery';

/**
 * why an organization could not be opened, recorded against it until it opens (effort 857,
 * requirement 7). The switcher says it in a short callout above that organization, with the update
 * action where `byVersion` holds: a newer rentable upgraded it past what this build reads, or past
 * what it writes on a way in that has to write.
 */
export type OrganizationRefusal = {
	/** the reason, in the reader's language. */
	sentence: string;
	/** what the shell said behind it, for a disclosure; `null` where it said nothing more. */
	detail: string | null;
	/** whether updating rentable is the way past it. */
	byVersion: boolean;
};

/**
 * a workspace that would not open, in an organization that did, which the held screen stands in
 * place of (effort 857, requirement 7): past what this build reads, or refused for a reason of its
 * own (ticket 25). Only read in the `held` state.
 */
export type WorkspaceHold = {
	workspaceId: string;
	/** the workspace as the session names it. */
	name: string;
	/** the reason, in the reader's language. */
	sentence: string;
	detail: string | null;
	/**
	 * whether updating rentable is the way past it. Only such a hold waits for a restart; any
	 * other is opened again when the person chooses it.
	 */
	byVersion: boolean;
};

/**
 * why the wall is up, which is only read while it is. The organization's three reasons, from
 * `sync/admission.ts`; the three that named an account and a session window went with the service
 * that issued them. *The third arrived with effort 826, requirement 22: `locked`, with the
 * sentence for a machine somebody signed out from another one.*
 */
export type SignInReason = 'noOrganization' | 'locked' | 'signedOutElsewhere';

/** everything the shell draws itself from. Read-only to it; only this unit writes. */
export type StartupSnapshot = {
	state: StartupState;
	/** what went wrong, already rendered for a reader. `null` where nothing did. */
	error: string | null;
	/**
	 * what the shell said behind `error`, in its own words, for a surface that has room for a
	 * details disclosure. Never shown beside the sentence ([[rules/interface]], *Error*). It
	 * belongs to the error it came with, so setting `error` without it clears it.
	 */
	errorDetail: string | null;
	recovery: Recovery | null;
	sync: RemoteSyncState | null;
	/** where this machine stands with organizations, which is what the wall admits on. */
	organization: OrganizationState | null;
	signInReason: SignInReason;
	/**
	 * whether the rail has been on screen yet in this run.
	 *
	 * It latches on and is never cleared: what it answers is *has this application been running*,
	 * and a load in the middle of a session does not un-answer that. Failing to start and update
	 * recovery still take the bare frame, because those are states where it stopped.
	 */
	railIsUp: boolean;
	/** whether a locale is loaded, which is what lets anything at all be drawn. */
	isI18nReady: boolean;
	/**
	 * whether a startup has already failed with no locale loaded.
	 *
	 * It latches on and is cleared by nothing but a locale arriving, which is what keeps the screen
	 * drawn for such a failure on screen across a retry. Without it the one control that failure
	 * offers replaces itself with the blank window it was offered from: `start` sets `loading` and
	 * clears the error, and nothing on this side of the gate has anything left to draw.
	 */
	hasFailedUnreadable: boolean;
	/** a password is being tried, which is a key derivation a person is waiting on. */
	isSigningIn: boolean;
	/**
	 * the name of the workspace a switch is opening, from before the open until the pass ends,
	 * and `null` otherwise.
	 *
	 * **It is what tells a switch's loading from a launch's.** Both are `loading`, and a switch is
	 * the one load with a person in and the rail already up, so it draws inside the page rather than
	 * as the application starting (effort 843, requirement 12).
	 */
	switching: string | null;
	/**
	 * whether a sign-out is moving the address off one that opens signed out, from the moment the
	 * wall goes up until the move has landed.
	 *
	 * **It is what lets the wall go up before the address moves** (effort 851). The wall is drawn
	 * over every address but the three that open signed out, so a sign-out from `/settings` has to
	 * leave it; leaving first drew the home page behind it signed in, loading, and putting the wall
	 * up first drew the settings of nobody for as long as the move took. While this holds, the wall
	 * covers those three as well, so a sign-out is one change on screen from wherever it starts.
	 */
	leavingForTheWall: boolean;
	/**
	 * every organization this run could not open, by its id, and why (effort 857, requirement 7).
	 * An entry is written where an organization is refused at launch, at sign-in, on switching or
	 * on joining, and removed the moment that organization admits somebody. Kept across a retry,
	 * since a retry that meets the same refusal is what it is there to say.
	 */
	refusals: Readonly<Record<string, OrganizationRefusal>>;
	/** the workspace the held screen stands in place of, while the state is `held`. */
	held: WorkspaceHold | null;
};

export const INITIAL: StartupSnapshot = {
	state: 'loading',
	error: null,
	errorDetail: null,
	recovery: null,
	sync: null,
	organization: null,
	signInReason: 'noOrganization',
	railIsUp: false,
	isI18nReady: false,
	hasFailedUnreadable: false,
	isSigningIn: false,
	switching: null,
	leavingForTheWall: false,
	refusals: {},
	held: null
};

/**
 * Whether a recovery record says anything at all.
 *
 * A record with every field blank is the absence of a recovery rather than one with nothing to
 * say, and putting the recovery screen up for it would stop an ordinary launch dead.
 */
export function hasRecoveryData(recovery: Recovery | null) {
	if (!recovery) {
		return false;
	}

	return (
		recovery.targetVersion.trim().length > 0 ||
		recovery.previousVersion.trim().length > 0 ||
		recovery.previousReleaseUrl.trim().length > 0 ||
		recovery.updateError !== null
	);
}
