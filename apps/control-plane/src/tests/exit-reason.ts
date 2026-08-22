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
 * which says `exitCode` against `signal`. Nothing anywhere says what was thrown.
 *
 * **`exitCode` against `signal` does not mean on Windows what #719 and #734 both said it means**,
 * and this is the only platform the defect has ever been seen on. Their reading was that a code
 * means JavaScript decided and a signal means something killed the process, so a native crash
 * would show as a signal. Windows has no POSIX signals. Measured here on 2026-08-22: a child that
 * calls `process.abort` reports `code=134, signal=null`, exactly as a child that throws reports
 * `code=1, signal=null`. **`signal` is unconditionally null on Windows and carries no
 * information at all.**
 *
 * What carries it is the *number*. `exitCodeMeaning` below is that reading, and it is the whole
 * of what the transcript could have told the person who saw this in the first place.
 *
 * **This file is silent on the case it was built for, and the silence is the point.** Measured on
 * 2026-08-22 by aborting a real test file of this suite: the runner reported the test green, the
 * file failed, `exitCode: 134` and `signal: ~`, and nothing here wrote a line. A native abort
 * takes the process down without running JavaScript exit handlers, so neither the monitor nor the
 * `exit` listener can see one. That is not a gap to fix. It is the reading:
 *
 * - a line here naming an error means JavaScript failed, and the answer is in this repository
 * - a line here saying nothing reached the process means something set the code deliberately
 * - **no line at all, with a non-zero `exitCode` in the transcript, means the process was killed
 *   for faulting**, and that is the shape the 2026-08-21 observation had
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

/**
 * What a non-zero exit code says, on the platform this defect lives on.
 *
 * The large values are Windows structured-exception codes, which the operating system uses as the
 * exit status of a process it killed for faulting. They are the ones worth recognising by name:
 * `tursodatabase/libsql#1051` and `#2074` both report a stack overflow out of libSQL on Windows
 * specifically, and this suite loads `@libsql/win32-x64-msvc`.
 */
const exitCodeMeaning = (code: number): string => {
	switch (code) {
		case 1:
			return 'an uncaught JavaScript error, which the runner would normally also have named';
		case 7:
			return "the test runner's own failure code, so it decided this rather than the process dying";
		case 134:
			return 'process.abort, which a native addon calls when it cannot continue';
		case 3221225477:
			return 'an access violation (0xC0000005). Native. Nothing in JavaScript did this';
		case 3221225725:
			return 'a stack overflow (0xC00000FD). Native, and the shape libSQL reports on Windows';
		case 3221226505:
			return 'a stack buffer overrun (0xC0000409). Native';
		default:
			return code > 0x40000000
				? 'a Windows exception code. Native, and the process was killed for faulting'
				: 'set by something in this process rather than by a fault';
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
		`  ${code} is ${exitCodeMeaning(code)}.\n` +
			'  no uncaughtException fired here. Read test-run.tap before concluding anything:\n' +
			'  a rejection left over from a test is named there by the runner, not here.\n' +
			'  do not read `signal` there. Windows has no signals and it is always null,\n' +
			'  so a native crash arrives as the code above rather than as a signal.'
	);
});
