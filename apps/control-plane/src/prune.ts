// Before anything reads `process.env`, for the same reason `./main.ts` does it. An import rather
// than a call, so it runs before the module bodies below it.
import 'dotenv/config';

import { connect, database, databaseUrl } from './database/database.ts';
import { forgetExpiredSessions } from './session/session.ts';

/**
 * Removing session rows that can never be presented again, run by a person.
 *
 * **Wiring and nothing else**, like `./main.ts`, `./sweep.ts` and `./decline.ts`. What pruning
 * *is* lives in `./session/session.ts`, which already takes its database and its clock as
 * arguments, so there is no module between this and the mechanism and nothing for one to add.
 *
 * **It keys on the absolute lifetime, and that is the only correct key.** A session three days
 * past its last reach is still refreshable: requirement 15 promises the client reconnects and the
 * window restarts with nobody typing anything. A prune written against `expires_at` instead would
 * remove exactly those, and it would surface as somebody who was offline for a weekend being sent
 * back to Google. That is why this calls {@link forgetExpiredSessions} rather than issuing a
 * `delete` of its own.
 *
 * **It is invoked and never scheduled**, which is requirement 19 read together with this effort's
 * *nothing is deployed*. A timer would be a schedule with nowhere to run, and a second thing to be
 * wrong about. An expired row is inert in the meantime, because `resumeSession` will not match
 * one, so what this answers is a bill rather than a defect.
 *
 * **The script is `prune-sessions` rather than `prune`, and that is not a preference.** `pnpm
 * prune` is one of pnpm's own commands, so a script by that name is shadowed: the invocation runs
 * pnpm's package pruning and never reaches this file. Renaming it back would document a command
 * that silently does something else.
 *
 *     pnpm --filter ./apps/control-plane prune-sessions
 */
const client = connect();
const removed = await forgetExpiredSessions(database(client), Date.now());

client.close();

// The count is the whole of the answer, and zero is a real one: a prune that found nothing is not
// a prune that failed, so nothing here exits non-zero. It is the same rule the other operations
// follow, from the Constraint that an operation removing rows says how many it removed.
console.info(
	removed === 0
		? 'no sign-in here has reached its month, so nothing was removed'
		: removed === 1
			? '1 sign-in past its month removed'
			: `${removed} sign-ins past their month removed`
);
console.info(`against ${databaseUrl()}`);
