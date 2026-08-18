import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Acceptance criterion 5: **no route on this API returns a domain row**, asserted rather than
 * intended.
 *
 * Testing it route by route would only cover the routes somebody remembered to list, and the
 * failure this guards against arrives *with* a new route. So it is asserted structurally
 * instead: a domain row would have to come from a domain table in this database — which
 * `schema.test.mjs` fixes at exactly three, none of them the domain's — or from a module
 * imported out of the desktop application, which is what this file forbids. There is nowhere
 * else it could come from.
 *
 * *Why it matters enough to be a test: the API is in the credential path continuously and in
 * the data path never, and that single property is what the whole architecture rests on. A
 * convenience route serving one contract "just for the dashboard" would end it, and nothing
 * else in this repository would object.*
 */
const source = fileURLToPath(new URL('.', import.meta.url));

/** @param {string} directory */
const filesUnder = async (directory) => {
	/** @type {string[]} */
	const found = [];

	for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
		if (entry.isFile() && /\.(ts|mjs)$/.test(entry.name)) {
			found.push(`${entry.parentPath}/${entry.name}`);
		}
	}

	return found;
};

const IMPORT = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** @param {string} text */
const importsIn = (text) => [
	...[...text.matchAll(IMPORT)].map((match) => match[1]),
	...[...text.matchAll(DYNAMIC_IMPORT)].map((match) => match[1])
];

test('the control plane imports nothing out of the desktop application', async () => {
	const files = await filesUnder(source);

	assert.ok(files.length > 5, 'the boundary test found almost no source to check');

	for (const file of files) {
		for (const specifier of importsIn(await readFile(file, 'utf8'))) {
			if (specifier === undefined) continue;

			const escapes = specifier.startsWith('.') && specifier.split('/')[0] === '..';
			const aliased = specifier.startsWith('$') || specifier.startsWith('@rentable/');
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
