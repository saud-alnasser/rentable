import { appendFileSync } from 'node:fs';

/**
 * Why a test process exited non-zero, recorded from inside that process.
 *
 * Loaded by `pnpm test` through a second `--import`, so it is installed in every test child the
 * runner spawns rather than in the runner itself. The runner's own process is not where the
 * failure happens.
 *
 * **This exists because #719 is a failure with no reason attached to it.** One run in some number
 * marks a test *file* as failed while every test inside it passes. #734 added the TAP transcript,
 * which says `exitCode: 7` against `signal: ~`, and that split is worth having: a code means
 * JavaScript decided, a signal means something killed the process. It is still only the verdict.
 * Nothing anywhere says what was thrown.
 *
 * **It observes and does not intervene, which is the whole design constraint.** The obvious
 * instrument is `process.on('unhandledRejection')`, and it is the wrong one: registering a
 * listener for that event replaces Node's default, the process stops exiting non-zero, and the
 * flake disappears without being explained. That is the outcome #719's Constraints name as not a
 * fix. `uncaughtExceptionMonitor` is the event built for this case. It fires before the default
 * runs and it does not suppress it, so the process still crashes exactly as it did. Since Node 15
 * an unhandled rejection is thrown by default, so it arrives here too, and `origin` says which of
 * the two it was.
 *
 * **The `exit` listener is the other half**, and what it is for is narrower than it looks.
 * Measured on 2026-08-22 while building this: a rejection thrown by a test's own leftover async
 * activity never reaches `uncaughtExceptionMonitor`, because the runner intercepts it first and
 * writes its own diagnostic naming the error. That line is already in `test-run.tap`, so the
 * transcript can explain that case unaided and this file adds nothing to it. Registering an
 * `unhandledRejection` listener to catch it anyway was tried and rejected: it does not suppress
 * the failure while the runner is intercepting, but it would suppress it in the path where the
 * runner is not, which is the path this defect most likely takes.
 *
 * So the `exit` listener covers what is left, and it is the interesting remainder: a process that
 * exits non-zero with no JavaScript error anywhere, which is an explicit `process.exit` or a
 * native abort closing a handle. It does not claim nothing was thrown, because the runner may
 * have named something it never saw. It says what it knows and points at the transcript.
 *
 * Written to stderr and to a file. Stderr is what a person watching the run sees, and the runner
 * attaches it to the failing file. The file survives a run whose output has scrolled away, which
 * is the case this defect actually presents as, and is gitignored beside `test-run.tap`.
 */
const REPORT = 'test-exit-reason.log';

/** which file this process is running, for a report that is read next to seven other files. */
const subject = process.argv[1] ?? '<unknown>';

const record = (what: string, detail: string): void => {
	const line = `[exit-reason] ${what}\n  file: ${subject}\n${detail}\n`;

	process.stderr.write(line);

	// appended rather than written, because every test file is its own process and they run
	// concurrently. Swallowed for the reason the teardown's `rm` is: an instrument that fails the
	// run it was added to diagnose has made things worse than the defect it was chasing.
	try {
		appendFileSync(REPORT, line);
	} catch {
		// nothing to do here. The stderr line above is already out.
	}
};

const describe = (error: unknown): string => {
	if (error instanceof Error) {
		return `  error: ${error.name}: ${error.message}\n  stack:\n${error.stack ?? '<none>'}`;
	}

	// a rejection carries whatever it was rejected with, and it is often not an `Error`. Printing
	// `[object Object]` here would waste the occurrence this whole file exists to catch.
	try {
		return `  thrown: ${typeof error} ${JSON.stringify(error)}`;
	} catch {
		return `  thrown: ${typeof error} ${String(error)}`;
	}
};

let reported = false;

process.on('uncaughtExceptionMonitor', (error: unknown, origin: string) => {
	reported = true;

	record(`${origin} in a test process`, describe(error));
});

process.on('exit', (code: number) => {
	if (code === 0 || reported) {
		return;
	}

	// deliberately not phrased as `nothing was thrown`. The runner intercepts a rejection from a
	// test's leftover async activity before this file could see it, and names it in its own
	// diagnostic, so a claim here that nothing threw would contradict a line already in the
	// transcript. What is true is only that nothing reached this process uncaught.
	record(
		`exited ${code}, and nothing reached this process uncaught`,
		'  no uncaughtException fired here. Read test-run.tap before concluding anything:\n' +
			'  a rejection left over from a test is named there by the runner, not here.\n' +
			'  if the transcript names nothing either, what is left is an explicit process.exit\n' +
			'  or a native failure closing a handle, and that is the interesting answer.'
	);
});
