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
 * `schema.test.ts` fixes at exactly four, none of them the domain's — or from a module
 * imported out of the desktop application, which is what this file forbids. There is nowhere
 * else it could come from.
 *
 * **Two workspace packages are permitted, and narrowing the ban to them is what makes the
 * permission safe.** `@rentable/workspace-migrations` is the SQL a workspace database is built
 * from, which the mint applies to a hosted one per decision 06. It carries no module and no row:
 * there is nothing in it to call, and a `CREATE TABLE` cannot become a route's answer. The clause
 * used to read `startsWith('@rentable/')`, which banned every workspace package rather than the
 * desktop application — and the copy of these migrations that ban forced was worse than what it
 * prevented, because the test holding the copy honest was hashed only against this package's own
 * files and so would not have run on the commit that broke it.
 *
 * **`@rentable/workspace-permission` joined it on 2026-08-21, and this is where that decision was
 * taken.** It is the flag table, the mask arithmetic and the check — six names against six bit
 * indices, and three functions over them. It declares no table, holds no row, and reaches no
 * database, so like the migrations there is nothing in it a route could answer with. What it is
 * *for* is the same argument the migrations already won: the desktop names the same six acts, and
 * the alternative to sharing them is a second copy of the table on the other side of the wire,
 * drifting silently, where a renamed flag reads as a permission nobody holds.
 *
 * *The list below is what makes this a decision rather than a drift.* It failed on the commit that
 * added the dependency, which is exactly what it is for.
 *
 * *Why it matters enough to be a test: the API is in the credential path continuously and in
 * the data path never, and that single property is what the whole architecture rests on. A
 * convenience route serving one contract "just for the dashboard" would end it, and nothing
 * else in this repository would object.*
 */
const source = fileURLToPath(new URL('..', import.meta.url));

/**
 * The workspace packages this API may reach for, and nothing else under `@rentable/`.
 *
 * See the note above for why each is safe. **Sorted, because the assertion below compares against
 * this list**, and a set built by walking the tree answers in whatever order the files were read.
 */
const WORKSPACE_PACKAGES = [
	'@rentable/workspace-migrations',
	'@rentable/workspace-permission'
] as const;

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
				(specifier.startsWith('@rentable/') &&
					!WORKSPACE_PACKAGES.includes(specifier as (typeof WORKSPACE_PACKAGES)[number]));
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
//
// *Four since #550, and the fourth is a credential rather than a record.* `session` holds a
// digest, an account and a window; it describes no tenant, no contract and no payment, so the
// property this test exists for is unchanged and only the number moved.
test('no table is declared here but the four the control plane owns', async () => {
	const declared = [];

	for (const file of await filesUnder(source)) {
		const text = await readFile(file, 'utf8');

		for (const match of text.matchAll(/sqliteTable\(\s*'([^']+)'/g)) {
			declared.push(match[1]);
		}
	}

	assert.deepEqual(declared.sort(), ['account', 'membership', 'session', 'workspace']);
});

/**
 * The permission above, held to the names it was granted for.
 *
 * A test that only forbade things would pass just as well if the exception grew — so this is the
 * other half: exactly these workspace specifiers appear in this package, and a third one is a
 * decision somebody has to come here and take. *It was one until 2026-08-21, and taking the
 * second is what the note at the top of this file records.*
 */
test('the only workspace packages this API imports are the two it is permitted', async () => {
	const reached = new Set<string>();

	for (const file of await filesUnder(source)) {
		for (const specifier of importsIn(await readFile(file, 'utf8'))) {
			if (specifier?.startsWith('@rentable/')) {
				reached.add(specifier);
			}
		}
	}

	assert.deepEqual([...reached].sort(), [...WORKSPACE_PACKAGES]);
});
