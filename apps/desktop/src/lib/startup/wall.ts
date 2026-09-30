import type { StartupMachine } from './machine';

/**
 * THE WALL
 *
 * The three things a person does at the sign-in wall or to put it back up: sign in, sign out, and
 * forget the organization this machine holds. Each ends on the machine's own pass (`./machine`),
 * and each says a refusal on the wall the person is still standing at rather than on a failure
 * screen that would take the wall away with it.
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
	try {
		if (!(await machine.admit())) {
			return;
		}

		if (!(await machine.hasWorkspace())) {
			return;
		}
	} finally {
		machine.set({ isSigningIn: false });
	}

	await machine.enterApplication();
}

/**
 * Somebody signed out, here or on another window.
 *
 * The keys this process held are dropped by the shell, and the held context names a member
 * whose vault is no longer open, which nothing else in the process would ever notice. The wall
 * goes up in whichever of its two states the machine is now in, which after a sign-out is
 * locked: the organization is still joined, and a password opens it again.
 */
export async function signOut(machine: StartupMachine) {
	machine.ports.cache.forgetContext();

	const organization = await machine.ports.organization.signOut().catch(() => null);

	machine.set({
		sync: await machine.ports.sync.getState().catch(() => null),
		organization: organization ?? {
			organization: null,
			session: null,
			holdsTursoAuthority: false,
			signedOutElsewhere: false
		}
	});

	if (!(await machine.admit())) {
		return;
	}

	// the shell said nobody signed out. The wall goes up regardless: this was asked for.
	await machine.raiseSignInWall('locked');
}

/**
 * Forget the organization this machine holds: the wall's way out while signed out, and the
 * organization page's while signed in, where the shell signs out first.
 *
 * **The confirm is the screen's, and this runs after it.** The shell deletes every replica,
 * empties the record and clears the Turso authority in one call, and what follows is the path
 * `standingChanged` already takes: read where the machine stands again, which is now nothing,
 * and admit on it, which raises the wall as a machine with nothing on it. A refusal is said on
 * the wall the person is still standing at, as a wrong password is, rather than as a failure
 * screen that would take the wall away with it.
 *
 * Refused while a password is being tried: the shell is deriving a key against a vault this
 * would delete from under it.
 */
export async function disconnect(machine: StartupMachine) {
	if (machine.current.isSigningIn) {
		return;
	}

	try {
		await machine.ports.organization.disconnect();
	} catch (error) {
		machine.set(machine.describe(error));

		return;
	}

	// the forget emptied the machine's own sync record as well, so the workspace it named is
	// not one the next sign-in should look for.
	machine.set({ sync: await machine.ports.sync.getState().catch(() => null) });

	await machine.standingChanged();
}
