import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ONE ICON FAMILY, AND THE GLYPHS THAT MIRROR
 *
 * Requirement 3 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], criteria
 * 3(a) and 3(c). Every glyph is lucide: the second family the application carried until then
 * drew the same concepts a second way, and a dependency nothing imports is one somebody will
 * reach for again. And the glyphs on the mirror list in `[[rules/frontend]]` *i18n* are turned
 * round in Arabic, while the ones the list names as never mirroring are not.
 *
 * Read from the tree rather than trusted, the way `platform/tests/no-google.test.ts` reads it for
 * the retired OAuth client.
 */

const FORBIDDEN_FAMILY = '@tabler/icons-svelte';

/** the lucide glyphs on the mirror list: back and next, and the chevrons of a sequence. */
const MIRRORING = [
	'arrow-left',
	'arrow-right',
	'chevron-left',
	'chevron-right',
	'chevrons-left',
	'chevrons-right'
];

/** the glyphs the list names as never mirroring: a clock, a check, the search glass, the mark, a slash. */
const NEVER_MIRRORING = [
	'clock',
	'clock-alert',
	'calendar-clock',
	'check',
	'circle-check',
	'badge-check',
	'search',
	'eclipse',
	'ban',
	'circle-slash'
];

/** what turns a glyph round: a half turn for one symmetric top to bottom, a reflection otherwise. */
const MIRROR = /rtl:(rotate-180|-scale-x-100)/g;

const here = fileURLToPath(import.meta.url);
const desktop = join(here, '..', '..', '..', '..', '..');
const repository = join(desktop, '..', '..');

const SOURCES = [join(desktop, 'src'), join(repository, 'packages')];
const SKIP = new Set(['node_modules', 'target', 'gen', 'build', '.svelte-kit']);
const SOURCE = /\.(ts|js|svelte)$/;

async function* files(root: string): AsyncGenerator<string> {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;

		const path = join(root, entry.name);

		if (entry.isDirectory()) {
			yield* files(path);
		} else if (SOURCE.test(entry.name)) {
			yield path;
		}
	}
}

async function sources() {
	const read: { path: string; text: string }[] = [];

	for (const root of SOURCES) {
		for await (const path of files(root)) {
			read.push({
				path: relative(repository, path).split(sep).join('/'),
				text: await readFile(path, 'utf8')
			});
		}
	}

	return read;
}

/** the local names a file imports each of `glyphs` under. */
function importedAs(text: string, glyphs: string[]) {
	const names: string[] = [];

	for (const match of text.matchAll(
		/import\s+(\w+)\s+from\s+'@lucide\/svelte\/icons\/([\w-]+)'/g
	)) {
		if (glyphs.includes(match[2]!)) names.push(match[1]!);
	}

	return names;
}

/** every opening tag in `text` that renders the component `name`. */
const tagsOf = (text: string, name: string) =>
	[...text.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);

test('no source file imports the second icon family, and no package declares it', async () => {
	const offenders = (await sources())
		.filter(
			({ path, text }) =>
				path !== relative(repository, here).split(sep).join('/') && text.includes(FORBIDDEN_FAMILY)
		)
		.map(({ path }) => path);

	assert.deepEqual(offenders, []);

	for (const manifest of [
		join(desktop, 'package.json'),
		join(repository, 'packages', 'design', 'package.json')
	]) {
		const { dependencies = {}, devDependencies = {} } = JSON.parse(
			await readFile(manifest, 'utf8')
		);

		assert.equal(
			FORBIDDEN_FAMILY in dependencies || FORBIDDEN_FAMILY in devDependencies,
			false,
			manifest
		);
	}
});

test('every glyph on the mirror list is turned round in Arabic wherever it is drawn', async () => {
	const unmirrored: string[] = [];
	let drawn = 0;

	for (const { path, text } of await sources()) {
		if (!path.endsWith('.svelte')) continue;

		const renders = importedAs(text, MIRRORING).flatMap((name) => tagsOf(text, name));

		drawn += renders.length;

		// the mirror class is on the glyph, or, where a primitive turns the whole control round,
		// on the element around it; either way the file carries one per glyph it draws.
		if (renders.length > (text.match(MIRROR) ?? []).length) {
			unmirrored.push(`${path}: ${renders.join(' ')}`);
		}
	}

	// the list is drawn: back controls, pagination, calendars and sub-menus all carry one.
	assert.ok(drawn > 0);
	assert.deepEqual(unmirrored, []);
});

test('no glyph the list names as never mirroring is turned round', async () => {
	const mirrored: string[] = [];

	for (const { path, text } of await sources()) {
		if (!path.endsWith('.svelte')) continue;

		for (const name of importedAs(text, NEVER_MIRRORING)) {
			for (const tag of tagsOf(text, name)) {
				if (MIRROR.test(tag)) mirrored.push(`${path}: ${tag}`);

				MIRROR.lastIndex = 0;
			}
		}
	}

	assert.deepEqual(mirrored, []);
});
