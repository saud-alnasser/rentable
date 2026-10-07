import type { StartupMachine } from './machine';

/**
 * THE WALL
 *
 * What a person does at the sign-in wall or to put it back up: sign in, sign out, and, at the
 * organization switcher the wall and the no-workspace screen draw, choose another organization or
 * forget one (effort 851). Each ends on the machine's own pass (`./machine`), and each says a
 * refusal where the person is still standing, on the wall or in the remove's confirm, rather than
 * on a failure screen that would take the wall away with it.
 */

/**
 * Sign in at the wall, by username and password, and go straight on into the application on
 * the far side of it.
 *
 * **One call, and it is a key derivation per member a person is waiting on.** The username
 * and the password are handed to the shell and never held here; what comes back is where the
 * machine stands, and the wall reads that. A refusal is a failure the wall says, with the one
 * sentence the shell allows it, the same for a wrong password, an unknown username and a
 * username held by somebody else. The person is still standing at the wall, so an error
 * screen would take away the control they need. A startup that fails after the sign-in has
 * succeeded is the ordinary failure every other path here reports, and reads as one.
 *
 * **It is the second way in rather than the usual one** (effort 826, requirement 12). A
 * machine that has signed in once is signed in again by the first `getState` of the launch,
 * so the wall is what a sign-out, a new machine and a key that no longer opens the vault
 * lead to.
 */
export async function signIn(machine: StartupMachine, username: string, password: string) {
	if (machine.current.isSigningIn) {
		return;
	}

	machine.set({ isSigningIn: true, error: null });

	try {
		machine.set({ organization: await machine.ports.organization.signIn(username, password) });
	} catch (error) {
		machine.set({ ...machine.describe(error), isSigningIn: false });

		return;
	}

	machine.rememberSession();

	// **The card stays closed until the loading surface is up.** Opening the workspace is a
	// pull of the organization replica and an open of the workspace's own, seconds on a real
	// network, and the card is still what is on screen for all of it: a second submit in that
	// window would derive a second key and run the way in twice, and a disconnect would delete
	// the replica the open is reading. Cleared on every path that leaves the person at a wall.
	//
	// **An open that fails is the ordinary failure, on the error screen** (effort 854, requirement
	// 10). The sign-in succeeded, so the wall has nothing left to say about the password, and a
	// wall left standing with the card reopened and nothing said is a failure nobody reads.
	try {
		if (!(await machine.admit())) {
			return;
		}

		if (!(await machine.hasWorkspace())) {
			return;
		}
	} catch (error) {
		await machine.fail(error);

		return;
	} finally {
		machine.set({ isSigningIn: false });
	}

	await machine.enterApplication();
}

/**
 * Somebody signed out, here or on another window.
 *
 * **The wall goes up first, in place, and everything else happens behind it** (effort 851, at the
 * human's word on 2026-10-06: no refresh, straight to the wall). The page being left stayed drawn
 * while the shell let go of the member, and the query cache was cleared under it, so a reader
 * watched the page go back to loading before the wall arrived; from `/settings`, which has to be
 * left, they watched home load too. Now the frame changes once: the wall replaces the page, with
 * no loading pass, and the shell signs out, the address moves and the cache is cleared with
 * nothing drawn from any of them.
 *
 * `arrive` moves the address off one that opens signed out, and the wall covers that address
 * until the move has landed (`leavingForTheWall`). A move that fails leaves the address where it
 * was, and what the standing says is drawn over it.
 *
 * The keys this process held are dropped by the shell, and the held context names a member
 * whose vault is no longer open, which nothing else in the process would ever notice. The wall
 * stays up in whichever of its two states the machine is now in, which after a sign-out is
 * locked: the organization is still joined, and a password opens it again.
 */
export async function signOut(
	machine: StartupMachine,
	{ arrive }: { arrive?: () => Promise<unknown> } = {}
) {
	machine.ports.cache.forgetContext();
	machine.ports.undo.forget();
	machine.set({
		state: 'sign-in',
		signInReason: 'locked',
		error: null,
		recovery: null,
		leavingForTheWall: arrive !== undefined
	});

	if (arrive) {
		try {
			await arrive();
		} catch {
			// the address stays where it was, and the standing below decides what is drawn over it.
		} finally {
			machine.set({ leavingForTheWall: false });
		}
	}

	const organization = await machine.ports.organization.signOut().catch(() => null);

	machine.set({
		sync: await machine.ports.sync.getState().catch(() => null),
		organization: organization ?? {
			organizations: [],
			selected: null,
			session: null,
			holdsTursoAuthority: false,
			setupConsented: false,
			signedOutElsewhere: false,
			heldByVersion: null
		}
	});

	if (!(await machine.admit())) {
		return;
	}

	// the shell said nobody signed out. The wall stays up regardless: this was asked for.
	await machine.raiseSignInWall('locked');
}

/**
 * whether the screen the switcher is drawn on is busy: a password being tried on the wall, or a
 * workspace being created on the no-workspace screen (effort 851, requirement 6). The first is
 * the unit's own; the second is the root layout's mutation, so the caller says it.
 */
type Busy = { isCreating?: boolean };

const isBusy = (machine: StartupMachine, { isCreating = false }: Busy) =>
	machine.current.isSigningIn || isCreating;

/**
 * Choose the organization the wall opens on, from those this machine holds (effort 851,
 * requirement 3), and put its wall up.
 *
 * **Switching happens signed out** (requirement 8). On the wall nobody is in; on the no-workspace
 * screen somebody is, and they are signed out first, since the shell refuses a choice while a
 * session is open. The choice is the record's rather than the screen's, so what follows is the
 * path every change of standing takes: read where the machine stands again, and admit on it, which
 * raises the chosen organization's wall asking for its username and password.
 *
 * Choosing the one already chosen changes nothing, and nothing is chosen while the screen is busy:
 * a sign-in is deriving a key against the chosen organization's vault, and a create is writing to
 * it. A refusal is said on the wall the person is standing at.
 */
export async function select(machine: StartupMachine, organizationId: string, busy: Busy = {}) {
	if (isBusy(machine, busy) || machine.current.organization?.selected === organizationId) {
		return;
	}

	// whatever happens next is another organization's, or a refusal on the way to one.
	machine.ports.undo.forget();

	let signedOut = false;

	try {
		if (machine.current.organization?.session) {
			machine.ports.cache.forgetContext();
			await machine.ports.organization.signOut();
			signedOut = true;
		}

		await machine.ports.organization.select(organizationId);
	} catch (error) {
		// signed out and then refused: the screen is the wall of the organization still chosen.
		if (signedOut) {
			await standingRead(machine);
		}

		machine.set(machine.describe(error));

		return;
	}

	await standingRead(machine);
}

/**
 * Forget one organization this machine holds, after the screen's confirm (effort 851,
 * requirement 5): the switcher's x, on the wall and on the no-workspace screen.
 *
 * **The confirm is the screen's, and this runs after it.** The shell deletes that organization's
 * replicas, entry, remembered sign-in and Turso consent, signing out first where it is the open
 * one; removing another leaves whoever is in signed in, which is what lets the no-workspace screen
 * remove another organization without leaving its own. What follows is the path every change of
 * standing takes, which lands on the wall of whichever organization the record now selects, or on
 * the welcome where none is left.
 *
 * **A refusal is thrown back to the confirm**, which is still open and says it in place, so the
 * person is standing at the question when they read it. Nothing is removed while the screen is
 * busy, for the reasons `select` gives. **Where the machine stands is read again either way**: a
 * refusal can come after the shell has done part of the forget, and a switcher still listing an
 * organization the record no longer holds would offer to sign in to nothing.
 */
export async function remove(machine: StartupMachine, organizationId: string, busy: Busy = {}) {
	if (isBusy(machine, busy)) {
		return;
	}

	// even where another organization goes and the member stays in (effort 854, requirement 1).
	machine.ports.undo.forget();

	// the held context names a member of the organization going, where it is the open one.
	if (machine.current.organization?.session?.organizationId === organizationId) {
		machine.ports.cache.forgetContext();
	}

	try {
		await machine.ports.organization.remove(organizationId);
	} finally {
		await standingRead(machine);
	}
}

/**
 * Read where the machine stands after a link was refused, and draw it in place (effort 851, the
 * review of requirement 13).
 *
 * **No loading pass, because the person is still reading the refusal.** The join screen says it
 * on the address it is on, and the pass every other change of standing takes puts the loading
 * surface up and takes the screen away, refusal and all. What a refused link can have moved is
 * the selection, where nobody is in and the link named an organization this machine holds, whose
 * wall then opens (requirement 13); and the session, where the link named the open organization,
 * which the shell signs out to judge the link on its replica. So the organization and the sync
 * record are read again, and the wall goes up where nobody is in any more; a session still open
 * is left as it is. *Until the review nothing was read after a refusal, so the wall went on naming
 * the organization chosen before, a sign-in there reached the one the link had chosen, and
 * choosing the first again at the switcher did nothing.*
 *
 * A read that fails changes nothing: the refusal is already on screen, and the next pass reads
 * again.
 */
export async function linkRefused(machine: StartupMachine) {
	let organization;

	try {
		organization = await machine.ports.organization.getState();
	} catch {
		return;
	}

	const wasIn = Boolean(machine.current.organization?.session);

	machine.set({
		sync: await machine.ports.sync.getState().catch(() => machine.current.sync),
		organization
	});

	// the held context named a member whose session the shell has just ended.
	if (wasIn && !organization.session) {
		machine.ports.cache.forgetContext();
	}

	await machine.admit();
}

/**
 * Read where the machine stands after the switcher changed it, and draw that.
 *
 * The sync record is read first: a remove empties the workspace it named where that was the
 * removed organization's, and a choice moves it to the chosen one's, so it is not one the next
 * sign-in should look for.
 */
async function standingRead(machine: StartupMachine) {
	machine.set({ sync: await machine.ports.sync.getState().catch(() => null) });

	await machine.standingChanged();
}
