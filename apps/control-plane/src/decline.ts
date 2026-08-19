// Before anything reads `process.env`, for the same reason `./main.ts` does it. An import rather
// than a call, so it runs before the module bodies below it.
import 'dotenv/config';

import { connect, database, databaseUrl } from './database/database.ts';
import { declineRenewalForEmail } from './session/decline.ts';

/**
 * Declining to renew, run by a person.
 *
 * **Wiring and nothing else**, like `./main.ts` and `./sweep.ts`. What declining *is* lives in
 * `./session/decline.ts`, which takes its database as an argument so the tests run the real thing.
 *
 * **A command rather than a route, which is decision 14.** A route would need an operator
 * identity, a credential for one and an audit trail, and this control plane has exactly one caller
 * class: an account holder identified by Google. `./sweep.ts` already set the shape for an
 * operation somebody performs on a day they picked, and a second mechanism for the same job is one
 * too many. What it assumes is written down rather than absorbed: whoever operates this can reach
 * the machine the process runs on.
 *
 * **It opens the database and never the server.** Declining is a write against this process's own
 * database, and the running server notices at the declined account's next reach, which is what
 * *takes effect at the next refresh* means.
 *
 * **It ends the sessions somebody holds; it does not bar them.** Nothing here refuses a later
 * sign-in, so an account declined today reaches this control plane again the moment its owner
 * signs in with Google. Deciding that somebody may not come back is the administrative surface
 * requirement 14 owns, and it is not this.
 *
 *     pnpm --filter ./apps/control-plane decline somebody@example.com
 */
const [, , asked] = process.argv;
const email = asked?.trim() ?? '';

if (email === '') {
	console.error('usage: pnpm --filter ./apps/control-plane decline <email>');
	process.exit(2);
}

const client = connect();
const result = await declineRenewalForEmail(database(client), email);

client.close();

// Exit codes rather than only prose, because the caller of this is a person at a terminal and an
// operation that did nothing has to be distinguishable from one that did something without
// reading the sentence. `2` above is the caller getting the invocation wrong; `1` here is the
// invocation being right and the account not being one this could act on.
switch (result.outcome) {
	case 'declined':
		// Zero is an answer rather than a failure, and it is worded so that an operator does not
		// read it as a ban: what ended is what was live, and signing in again starts a new one.
		console.info(
			result.ended === 0
				? `${result.email} (${result.accountId}) held no live session, so none ended`
				: `${result.email} (${result.accountId}): ${result.ended} session${result.ended === 1 ? '' : 's'} ended`
		);
		console.info(`against ${databaseUrl()}`);
		break;

	case 'no-such-account':
		console.error(`no account here has the address ${result.email}`);
		// after `process.exit`, which `no-fallthrough` does not read as terminating.
		process.exit(1);
		break;

	case 'ambiguous':
		// Named rather than counted: the operator's next move is to pick one, and a number does
		// not help them do it.
		console.error(
			`${result.email} names ${result.accountIds.length} accounts, so nothing was done:`
		);

		for (const id of result.accountIds) {
			console.error(`  ${id}`);
		}

		process.exit(1);
}
