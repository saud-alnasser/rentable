import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Acceptance criterion 5: **no route on this API returns a domain row**, asserted rather than
 * intended.
 *
 * Testing it route by route would only cover the routes somebody remembered to list, and the
 * failure this guards against arrives *with* a new route. So it is asserted structurally
 * instead: a domain row would have to come from a domain table in this database — which
 * `schema.test.ts` fixes at exactly three, none of them the domain's — or from a module
 * imported out of the desktop application, which is what this file forbids. There is nowhere
 * else it could come from.
 *
 * **One workspace package is permitted, and narrowing the ban to it is what makes the permission
 * safe.** `@rentable/workspace-migrations` is the SQL a workspace database is built from, which
 * the mint applies to a hosted one per decision 06. It carries no module and no row: there is
 * nothing in it to call, and a `CREATE TABLE` cannot become a route's answer. The clause used to
 * read `startsWith('@rentable/')`, which banned every workspace package rather than the desktop
 * application — and the copy of these migrations that ban forced was worse than what it
 * prevented, because the test holding the copy honest was hashed only against this package's own
 * files and so would not have run on the commit that broke it.
 *
 * *Why it matters enough to be a test: the API is in the credential path continuously and in
 * the data path never, and that single property is what the whole architecture rests on. A
 * convenience route serving one contract "just for the dashboard" would end it, and nothing
 * else in this repository would object.*
 */
const source = fileURLToPath(new URL('..', import.meta.url));

/** the one workspace package this API may reach for. See the note above for why it is safe. */
const WORKSPACE_MIGRATIONS = '@rentable/workspace-migrations';

const filesUnder = async (directory: string) => {
	const found: string[] = [];

	for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
		if (entry.isFile() && /\.ts$/.test(entry.name)) {
			found.push(resolve(entry.parentPath, entry.name));
		}
	}

	return found;
};

const IMPORT = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

const importsIn = (text: string) => [
	...[...text.matchAll(IMPORT)].map((match) => match[1]),
	...[...text.matchAll(DYNAMIC_IMPORT)].map((match) => match[1])
];

test('the control plane imports nothing out of the desktop application', async () => {
	const files = await filesUnder(source);

	assert.ok(files.length > 5, 'the boundary test found almost no source to check');

	for (const file of files) {
		for (const specifier of importsIn(await readFile(file, 'utf8'))) {
			if (specifier === undefined) continue;

			// Where it lands, not how it is spelled. A test says `../account.ts` and stays
			// inside the package; the ban is on leaving it, and counting `..` segments cannot
			// tell those apart now that a test sits one directory below its subject.
			const escapes =
				specifier.startsWith('.') && !resolve(dirname(file), specifier).startsWith(source);
			const aliased =
				specifier.startsWith('$') ||
				(specifier.startsWith('@rentable/') && specifier !== WORKSPACE_MIGRATIONS);
			const named = specifier.includes('apps/desktop');

			assert.ok(
				!escapes && !aliased && !named,
				`${file} imports ${specifier}. The control plane holds no domain data and reaches ` +
					'for none: the API is in the credential path and never in the data path.'
			);
		}
	}
});

// The other half of the same guard. A domain table declared anywhere in this package — not only
// in schema.ts — would give a route something to return.
test('no table is declared here but the three the control plane owns', async () => {
	const declared = [];

	for (const file of await filesUnder(source)) {
		const text = await readFile(file, 'utf8');

		for (const match of text.matchAll(/sqliteTable\(\s*'([^']+)'/g)) {
			declared.push(match[1]);
		}
	}

	assert.deepEqual(declared.sort(), ['account', 'membership', 'workspace']);
});

/**
 * The permission above, held to one name.
 *
 * A test that only forbade things would pass just as well if the exception grew — so this is the
 * other half: exactly one workspace specifier appears in this package, and a second one is a
 * decision somebody has to come here and take.
 */
test('the only workspace package this API imports is the workspace migrations', async () => {
	const reached = new Set<string>();

	for (const file of await filesUnder(source)) {
		for (const specifier of importsIn(await readFile(file, 'utf8'))) {
			if (specifier?.startsWith('@rentable/')) {
				reached.add(specifier);
			}
		}
	}

	assert.deepEqual([...reached], [WORKSPACE_MIGRATIONS]);
});
