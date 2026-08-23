/**
 * Which drizzle-kit command an invocation names, and whether that command opens a database.
 *
 * **drizzle-kit loads the config for every one of its commands**, including the ones that read
 * files and connect to nothing, so the refusal `./database.ts` produces reached `generate` and
 * `check` as well as `migrate`. Somebody generating a migration on a fresh clone was told to
 * configure a database they were not about to open, which is #758.
 *
 * Deferring the refusal behind a getter on `dbCredentials` was tried first and does not work:
 * drizzle-kit reads the property while validating the config, before it knows which command it is
 * running. Reading the invocation is what was left, and it is the whole cost of this file: a
 * second place that has to know drizzle-kit's commands. `../../drizzle.config.ts` is the only
 * caller, and `tests/drizzle-kit.test.ts` is what keeps the knowledge honest.
 */

/**
 * The commands that open nothing, read off drizzle-kit 0.31.10's own command definitions in
 * `bin.cjs`: `check`, `up`, `drop` and `export` never mention `dbCredentials`, and `generate`
 * builds its parameters from the schema, `out` and the dialect alone. The other four, `migrate`,
 * `push`, `introspect` and `studio`, each flatten `dbCredentials` into connection credentials and
 * exit when it is missing.
 */
const OPENS_NOTHING = new Set(['generate', 'check', 'up', 'drop', 'export']);

/**
 * The command an invocation names, by the rule drizzle-kit resolves it with rather than by
 * position.
 *
 * **It is not `argv[2]`.** The command is the first argument that is neither a flag nor a flag's
 * value, so `drizzle-kit --config drizzle.config.ts generate` names `generate` at index 4. This
 * mirrors `getCommand` in the brocli bundled into `bin.cjs`: `--help` and `--version` are skipped
 * along with the boolean that may follow either, and any other argument starting with `-` consumes
 * the one after it unless it carries its value after an `=`.
 *
 * Mirroring the parser rather than approximating it is what makes a disagreement impossible. An
 * invocation drizzle-kit reads as `migrate` is read as `migrate` here, including the ones it reads
 * as naming no command at all.
 */
export const commandIn = (argv: readonly string[]): string | undefined => {
	const args = argv.slice(2);

	for (let index = 0; index < args.length; index++) {
		const argument = args[index] ?? '';

		if (['--help', '-h', '--version', '-v'].includes(argument)) {
			const value = args[index + 1]?.toLowerCase();

			if (value === '0' || value === '1' || value === 'true' || value === 'false') index++;

			continue;
		}

		if (argument.startsWith('-')) {
			if (!argument.includes('=')) index++;

			continue;
		}

		return argument;
	}

	return undefined;
};

/**
 * Whether this invocation opens a database, which is what decides whether a configuration that
 * cannot work is refused.
 *
 * **The list it consults is of commands that open nothing, and the polarity is the point.** A
 * command drizzle-kit adds later is absent from it and so is treated as opening a database: a new
 * offline command would refuse, which is #758 again and no worse than the day before this file
 * existed, while a new connecting one is covered from the day it ships. The other polarity fails
 * the other way, and the way it fails is #755's defect coming back on a command nobody listed.
 *
 * An invocation naming no command opens nothing either. `drizzle-kit`, `drizzle-kit --help` and
 * `drizzle-kit --version` print and exit, and none of them should be asking for a database.
 *
 * *What the polarity costs in practice is nothing, measured on 0.31.10: drizzle-kit loads the
 * config inside each command's own handler, so `drizzle-kit help migrate` and a mistyped command
 * never reach it at all. Both print what they were going to print with nothing configured. The
 * list only decides the case it was written for, which is a command drizzle-kit really has.*
 */
export const opensADatabase = (argv: readonly string[]): boolean => {
	const command = commandIn(argv);

	return command !== undefined && !OPENS_NOTHING.has(command);
};
