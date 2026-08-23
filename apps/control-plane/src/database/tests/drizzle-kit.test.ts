import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { commandIn, opensADatabase } from '../drizzle-kit.ts';

/**
 * #758: a migration is generated without a database to open.
 *
 * `../drizzle-kit.ts` is a second place that knows drizzle-kit's command list, which is the whole
 * cost of the fix. These tests are what makes the knowledge checkable rather than remembered: the
 * command names are pinned here, and the two spawns at the foot measure the real binary against
 * the real config so a drizzle-kit upgrade that moved a command out from under the list fails
 * here instead of on somebody's fresh clone.
 *
 * The invocations are written the way a shell produces them, with the interpreter and the script
 * in front, because that is what `process.argv` is when the config reads it.
 */
const invocation = (...args: string[]): string[] => ['node', 'drizzle-kit', ...args];

const PACKAGE = fileURLToPath(new URL('../../../', import.meta.url));
const DRIZZLE_KIT = fileURLToPath(
	new URL('../../../node_modules/drizzle-kit/bin.cjs', import.meta.url)
);

/**
 * **A blanked variable rather than an absent one**, for the reason `database.test.ts` gives at the
 * foot of its own spawn: `dotenv` does not override a key already present in `process.env`, and an
 * empty string counts as present. So this is a fresh clone with no `.env` even on a machine that
 * has one.
 */
const ran = (command: string) => {
	const run = spawnSync(process.execPath, [DRIZZLE_KIT, command], {
		cwd: PACKAGE,
		encoding: 'utf8',
		env: { ...process.env, CONTROL_PLANE_DATABASE_URL: '', CONTROL_PLANE_DATABASE_TOKEN: '' }
	});

	return { status: run.status, said: `${run.stdout ?? ''}${run.stderr ?? ''}` };
};

test('the command is the first argument that is not a flag or a flag value', () => {
	assert.equal(commandIn(invocation('generate')), 'generate');

	// The case that rules out `argv[2]`. drizzle-kit's own parser takes an argument starting with
	// `-` as consuming the one after it unless the value is written after an `=`, so the command
	// sits at a different index in each of these and is the same command in all three.
	assert.equal(commandIn(invocation('--config', 'drizzle.config.ts', 'migrate')), 'migrate');
	assert.equal(commandIn(invocation('--config=drizzle.config.ts', 'migrate')), 'migrate');
	assert.equal(commandIn(invocation('migrate', '--config', 'drizzle.config.ts')), 'migrate');
});

// `--help` and `--version` are the two flags drizzle-kit's parser skips rather than treating as
// consuming a value, and either may be followed by a boolean.
test('an invocation that asks for help or a version names no command', () => {
	for (const args of [[], ['--help'], ['-h'], ['--version'], ['-v'], ['--help', 'true']]) {
		assert.equal(commandIn(invocation(...args)), undefined, args.join(' '));
	}
});

test('the commands that open a database are exactly the four that read dbCredentials', () => {
	for (const command of ['migrate', 'push', 'introspect', 'studio']) {
		assert.equal(opensADatabase(invocation(command)), true, command);
	}

	for (const command of ['generate', 'check', 'up', 'drop', 'export']) {
		assert.equal(opensADatabase(invocation(command)), false, command);
	}
});

/**
 * The polarity, asserted rather than left to the docstring.
 *
 * A command drizzle-kit adds that this file has never heard of is treated as opening a database,
 * so it refuses a configuration that cannot work. That is the safe way to be wrong: the cost is
 * #758 again on one command, where the other polarity would let a new connecting command run
 * against nothing and quietly reopen what #755 closed.
 */
test('a command nobody listed is taken to open a database', () => {
	assert.equal(opensADatabase(invocation('a-command-drizzle-kit-does-not-have')), true);

	// And an invocation naming no command opens nothing, because none of those three reach a
	// database: they print and exit.
	assert.equal(opensADatabase(invocation()), false);
	assert.equal(opensADatabase(invocation('--help')), false);
});

/**
 * The whole of #758, measured against the real binary rather than inferred from the list above.
 *
 * `check` reads `migrations/` and writes nothing, which is what makes it the one safe to spawn
 * unconditionally. `generate` writes a migration when the schema has moved, so the directory is
 * read either side of it: an unchanged listing is the assertion, and a changed one means the
 * schema drifted rather than that this fix is wrong, which the message says.
 */
test('a command that opens no database runs on a clone with nothing configured', async () => {
	const before = (await readdir(new URL('../../../migrations/', import.meta.url))).sort();
	const check = ran('check');

	assert.equal(check.status, 0, `check exited ${check.status}: ${check.said}`);

	const generate = ran('generate');

	assert.equal(generate.status, 0, `generate exited ${generate.status}: ${generate.said}`);
	assert.doesNotMatch(generate.said, /CONTROL_PLANE_DATABASE_URL/);

	assert.deepEqual(
		(await readdir(new URL('../../../migrations/', import.meta.url))).sort(),
		before,
		'generate wrote a migration, so the schema has moved and one is owed'
	);
});

// The other half, and the constraint #758 was written under: the fix does not hand the connecting
// commands a database that cannot work. The wording is `resolveDatabase`'s, which is what says the
// refusal is still the one place it was.
test('a command that opens a database still refuses one that cannot work', () => {
	for (const command of ['migrate', 'push', 'studio']) {
		const run = ran(command);

		assert.notEqual(run.status, 0, `${command} exited 0 with nothing configured`);
		assert.match(run.said, /CONTROL_PLANE_DATABASE_URL is not set/);
		assert.match(run.said, /\.env\.example/);
	}
});
