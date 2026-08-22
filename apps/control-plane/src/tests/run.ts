import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The suite, and what it does when the operating system kills one of its files.
 *
 * `pnpm test` runs this rather than `node --test` directly. On a green run the difference is one
 * extra process and nothing else: the same runner, the same flags, the same two reporters, and
 * its exit code handed back untouched.
 *
 * **It is a workaround for #719 and it is labelled as one.** `@libsql/win32-x64-msvc` faults
 * under load on Windows and the operating system kills the child process running a test file for
 * it, with an access violation, `0xC0000005`, which arrives as exit code `3221225477`. Every test
 * in that file has already passed when it happens, which is why the run before and the run after
 * are green and why the failure had nothing anybody could point at. Eight captures on #719 say
 * the same thing, every forced misuse of the client came back clean, and no JavaScript is on the
 * path: there is no repository-side cause to fix.
 *
 * **What else was considered.**
 *
 * - *Serialising the suite on Windows.* `--test-concurrency=1` removes the suite's own contention
 *   and not the fault. It was caught with twelve files on thirty-two idle cores, so one process at
 *   a time is the rarest setting rather than a safe one, and it would cost the local run its wall
 *   clock while buying the gate nothing: the gate is `ubuntu-latest` and never loads this binding.
 * - *A native stack, filed upstream.* Worth having, and not a fix here. It needs the Windows
 *   debugging tools installed with administrator rights, and `tursodatabase/libsql#1051` and
 *   `#2074` already report faults of this shape.
 * - *Swallowing the failure.* Rejected on #719 before this existed: a listener that stops the
 *   process exiting non-zero makes the symptom go away without explaining it.
 *
 * **Remove it when the fault is gone**, which is one commit: delete this file and put the
 * `node --test` line back in `package.json`. That is libSQL fixing the Windows fault, or this
 * suite no longer loading a native libSQL binding. The stderr notice below is the evidence to
 * decide on, because a stretch of runs that never prints it is the fault having stopped.
 */

/** the test files, expanded by the runner rather than by a shell, which on Windows expands nothing. */
const SUBJECTS = 'src/**/*.test.ts';

/**
 * The transcript the decision below reads, and the one the README sends a person to.
 *
 * **Two suites running at once in this directory share it.** That is worth knowing here rather
 * than anywhere else, because reproducing #719 means running several at once: they write one file
 * over each other, and the decision would then be made from whatever survived. Nothing in the
 * ordinary path runs two, so this is a note and not a guard.
 */
const TRANSCRIPT = 'test-run.tap';

/**
 * Where a re-run's transcript goes, so the faulting run's own survives it.
 *
 * The transcript is the only durable record of an occurrence, and overwriting it with a green
 * re-run would erase the one thing worth reading afterwards.
 */
const RETRY_TRANSCRIPT = 'test-run.retry.tap';

/**
 * Above this, an exit code is a Windows exception code rather than a status a process chose.
 *
 * `src/tests/exit-reason.ts` reads the same boundary from inside the child and names the
 * individual codes; this is the same reading made from outside it.
 */
const WINDOWS_EXCEPTION = 0x40000000;

const runner = (transcript: string, subjects: string[]) => [
	'--import',
	'tsx',
	'--import',
	'./src/tests/exit-reason.ts',
	'--test',
	'--test-reporter=spec',
	'--test-reporter-destination=stdout',
	'--test-reporter=tap',
	`--test-reporter-destination=${transcript}`,
	...subjects
];

const run = (transcript: string, subjects: string[]) =>
	spawnSync(process.execPath, runner(transcript, subjects), { stdio: 'inherit' });

type Failure = {
	/** what the runner called it: a test's name, or a file's path where the file itself failed. */
	subject: string;
	/** the child process's exit status, which only a file-level failure carries. */
	exitCode: number | undefined;
};

/**
 * A TAP description, with the escaping the format put on it taken back off.
 *
 * TAP escapes a backslash and a hash, so a Windows path arrives as `src\\tests\\probe.test.ts`.
 * It is undone here rather than where it is used, because the subject is both printed to a person
 * and handed back to the runner as a path, and neither wants the doubled form.
 */
const unescaped = (description: string) => description.replace(/\\(.)/g, '$1');

const POINT = /^not ok \d+ - (.*)$/;
const EXIT_CODE = /^ {2}exitCode: (\d+)$/;

/**
 * Every top-level failure in a transcript, with the exit code where there is one.
 *
 * Anchored at column zero, and the indentation is what carries the meaning: the runner reports
 * every test of every file as a top-level point, adds a point for a *file* when its process
 * failed, and indents a subtest under its parent. Reading indented points as well would count a
 * failure the runner already reported once.
 */
const failuresIn = (transcript: string): Failure[] => {
	const lines = transcript.split(/\r?\n/);
	const failures: Failure[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const point = POINT.exec(lines[index] ?? '');

		if (!point) continue;

		let exitCode: number | undefined;

		// the diagnostic block belonging to this point, which is everything indented under it
		// until the next thing that is not.
		for (
			let inside = index + 1;
			inside < lines.length && (lines[inside] ?? '').startsWith('  ');
			inside += 1
		) {
			const code = EXIT_CODE.exec(lines[inside] ?? '');

			if (code) exitCode = Number(code[1]);
		}

		failures.push({ subject: unescaped(point[1] ?? ''), exitCode });
	}

	return failures;
};

/**
 * Whether a failure is the one this file exists for: a test file whose process was killed.
 *
 * All three clauses are load-bearing. A failing assertion carries no `exitCode` at all, a process
 * that chose its own status carries one far below the exception range, and a test whose *name*
 * happened to end in `.test.ts` would still have to have been killed to reach here.
 */
const killedByTheOperatingSystem = (failure: Failure) =>
	failure.subject.endsWith('.test.ts') &&
	failure.exitCode !== undefined &&
	failure.exitCode > WINDOWS_EXCEPTION;

const notice = (line: string) => process.stderr.write(`[719] ${line}\n`);

const firstRun = run(TRANSCRIPT, [SUBJECTS]);

if (firstRun.status === 0) {
	process.exit(0);
}

// No status at all is a runner that was killed itself or never started, and neither is something
// this file can reason about from a transcript. Say what went wrong where there is anything to
// say, and hand it on rather than guessing at it.
if (firstRun.status === null) {
	if (firstRun.error) notice(`the runner did not start: ${firstRun.error.message}`);

	process.exit(1);
}

const transcript = (() => {
	try {
		return readFileSync(TRANSCRIPT, 'utf8');
	} catch {
		// a run that failed before writing a transcript has nothing here to read, and a missing
		// file is not a reason to lose the exit code the run already earned.
		return '';
	}
})();

const failures = failuresIn(transcript);
const killed = failures.filter(killedByTheOperatingSystem);

// Every failure, or none of them. A run that faulted *and* failed an assertion has something to
// fix, and re-running it would report the fault as though it were the whole story.
if (killed.length === 0 || killed.length !== failures.length) {
	process.exit(firstRun.status);
}

for (const failure of killed) {
	notice(
		`${failure.subject} was killed by the operating system, exit ${failure.exitCode}, with no test in it failing.`
	);
}

notice('That is the libSQL Windows fault #719 records.');
notice(`The transcript of the run that faulted is kept at ${TRANSCRIPT}.`);
notice('Re-running those files once. What follows counts them rather than the whole suite.');

const reRun = run(
	RETRY_TRANSCRIPT,
	killed.map((failure) => failure.subject)
);

if (reRun.status === 0) {
	notice('The re-run passed, so the suite passes.');
	process.exit(0);
}

notice('The re-run did not pass, so this is not the fault above being retried away. Read it.');
process.exit(reRun.status ?? 1);
