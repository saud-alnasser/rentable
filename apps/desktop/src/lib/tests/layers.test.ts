// Pins the four-layer rule of effort 840 (plan, *Architecture*) across `src/lib/`: foundation,
// capabilities, features, composition. Imports point down, or sideways through an entry; never
// up, and never in a cycle. It reads the tree as text with `node:fs`, the way
// `api/tests/boundaries.test.ts` does, so it adds no dependency.
//
// A violation is one line of `layers.baseline.txt`, `from -> to : kind`, and there are five kinds:
//
//   upward   file -> file       a module imports one in a higher layer
//   cycle    module -> module   an edge of the module graph that lies on a cycle
//   deep     file -> file       an import past a feature's or capability's entry
//   import   file -> feature    a feature imported by a home that is neither a feature nor `app/`
//   literal  file -> kind       a record kind spelled as a literal outside its feature and `app/`
//
// The last two are one rule, that the shell and the mechanisms hold no per-feature list
// (requirement 2). A feature may import another feature's entry, since requirement 4 has
// features talk through their public APIs; one reaching past that entry is a `deep` line, and
// is not counted again as `import`. A deep import is judged against features and capabilities,
// the homes requirement 4 gives a public API. A home's entry is its `index.ts`, and a capability
// has a second one, `ui.ts`, which re-exports by name the components other concepts render; its
// `component/` stays private, so reaching into it from outside is `deep`. A feature shares no
// component, so a feature's `ui.ts` is no entry. `app/` may also read a feature's `feature.ts`
// and `surface.ts`, which is how it lists them. `import type` is erased at runtime and is not
// counted by any kind.
//
// The tree does not obey the rule yet, so today's violations are the baseline, and the baseline
// can only shrink: a violation it does not list fails, and so does a line that no longer occurs,
// so a move that removes one deletes its line in the same commit. The effort ends with it empty.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { RECORD_KINDS } from '@rentable/workspace-permission';

const LIB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = fileURLToPath(new URL('layers.baseline.txt', import.meta.url));

type Layer = 'foundation' | 'capability' | 'feature' | 'composition';

const RANK: Record<Layer, number> = { foundation: 1, capability: 2, feature: 3, composition: 4 };

// Every top-level directory of `src/lib/` and its layer, as plan.md's *Components* tree assigns
// them. Homes the effort has not created yet are listed already, so a ticket creating one finds
// its layer here; one that creates a home the plan does not name adds it.
const LAYERS: Record<string, Layer> = {
	// 1 foundation: imports the design package and third-party code
	api: 'foundation',
	design: 'foundation',
	error: 'foundation',
	feature: 'foundation',
	i18n: 'foundation',
	platform: 'foundation',

	// 2 capabilities: the mechanisms every feature shares
	act: 'capability',
	create: 'capability',
	date: 'capability',
	form: 'capability',
	history: 'capability',
	list: 'capability',
	mutation: 'capability',
	notification: 'capability',
	palette: 'capability',
	permission: 'capability',
	print: 'capability',
	shortcut: 'capability',
	transfer: 'capability',
	undo: 'capability',

	// 3 features
	complex: 'feature',
	contract: 'feature',
	dashboard: 'feature',
	organization: 'feature',
	payment: 'feature',
	settings: 'feature',
	startup: 'feature',
	sync: 'feature',
	tenant: 'feature',
	update: 'feature',
	workspace: 'feature',

	// 4 composition: `app/` is the composition root, the one place that names every feature
	app: 'composition',
	layout: 'composition',
	prototype: 'composition',
	shell: 'composition'
};

// The feature a record kind belongs to, where it is not the feature of the same name.
const KIND_OWNER: Record<string, string> = { unit: 'complex' };

const COMPOSITION_ROOT = 'app';

// What the composition root reads from a feature besides its entry (plan, *Components*).
const DECLARATIONS = ['feature.ts', 'surface.ts'];

function toPosix(path: string) {
	return path.split(sep).join('/');
}

function moduleOf(label: string) {
	return label.split('/')[0];
}

// Every source file under `src/lib/`, labelled from it. A `tests/` directory covers the rules
// rather than obeying them, so it is left out.
function libraryFiles() {
	return readdirSync(LIB_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|js|svelte)$/.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(LIB_ROOT, file)) };
		})
		.filter(({ label }) => label.includes('/') && !label.split('/').includes('tests'));
}

// The code with its comments blanked, so an example in a docstring is not read as an import.
// Strings are kept whole, because a `//` inside one is not a comment.
function withoutComments(code: string) {
	let out = '';
	let i = 0;

	while (i < code.length) {
		const char = code[i];
		const next = code[i + 1];

		if (char === '/' && next === '/') {
			while (i < code.length && code[i] !== '\n') i++;
		} else if (char === '/' && next === '*') {
			const end = code.indexOf('*/', i + 2);
			const stop = end === -1 ? code.length : end + 2;
			out += code.slice(i, stop).replace(/[^\n]/g, ' ');
			i = stop;
		} else if (char === "'" || char === '"' || char === '`') {
			let j = i + 1;
			while (j < code.length && code[j] !== char) {
				if (code[j] === '\\') j++;
				else if (char !== '`' && code[j] === '\n') break;
				j++;
			}
			out += code.slice(i, j + 1);
			i = j + 1;
		} else {
			out += char;
			i++;
		}
	}

	return out;
}

// A file's script, which is where it imports, and all of its text with comments removed, which
// is where a literal can sit. A component's markup is not script, so it is only stripped of its
// HTML comments: an apostrophe in prose would otherwise open a string.
function readSource(file: string) {
	const text = readFileSync(file, 'utf8');
	if (!file.endsWith('.svelte')) {
		const code = withoutComments(text);
		return { script: code, all: code };
	}

	const blocks = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
	const script = [...text.matchAll(blocks)].map((match) => withoutComments(match[1])).join('\n');
	const markup = text
		.replace(blocks, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	return { script, all: `${script}\n${markup}` };
}

// Every specifier the script imports at runtime: static imports and re-exports, side-effect
// imports and dynamic imports. `import type`, `export type`, and a named list whose every
// specifier is inline `type` are erased and left out.
function valueImports(script: string) {
	const specifiers: string[] = [];

	const statement = /(?:^|[;\s}])(?:import|export)\s+([^;'"`]*?)\s*from\s*(['"])([^'"]+)\2/g;
	for (const [, clause, , specifier] of script.matchAll(statement)) {
		if (/^type\s/.test(clause)) continue;

		const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
		const names = named?.[1]
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);
		if (names && names.length > 0 && names.every((name) => /^type\s/.test(name))) continue;

		specifiers.push(specifier);
	}

	for (const [, , specifier] of script.matchAll(/(?:^|[;\s])import\s*(['"])([^'"]+)\1/g)) {
		specifiers.push(specifier);
	}
	for (const [, , specifier] of script.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
		specifiers.push(specifier);
	}

	return specifiers;
}

function isFile(path: string) {
	return existsSync(path) && statSync(path).isFile();
}

// The library-relative label a specifier names, resolved to the file it reaches where one
// exists, or undefined where it leaves `src/lib/`.
function resolve(fromFile: string, specifier: string) {
	let path: string;
	if (specifier === '$lib' || specifier.startsWith('$lib/')) {
		path = join(LIB_ROOT, specifier.slice('$lib'.length));
	} else if (specifier.startsWith('.')) {
		path = join(dirname(fromFile), specifier);
	} else {
		return undefined;
	}

	const label = toPosix(relative(LIB_ROOT, path));
	if (label === '' || label.startsWith('..')) return undefined;

	const candidates = [
		path,
		path.replace(/\.js$/, '.ts'),
		`${path}.ts`,
		`${path}.js`,
		`${path}.svelte`,
		join(path, 'index.ts'),
		join(path, 'index.js')
	];
	const found = candidates.find(isFile);

	return found ? toPosix(relative(LIB_ROOT, found)) : label;
}

// Whether a label is its home's entry: the home's `index.ts`, or for a capability its `ui.ts`.
function isEntry(label: string, layer: Layer) {
	const parts = label.split('/');
	if (parts.length === 1) return true;
	if (parts.length !== 2) return false;
	return /^index\.(ts|js)$/.test(parts[1]) || (layer === 'capability' && parts[1] === 'ui.ts');
}

// Every edge of the module graph that lies on a cycle: `a -> b` where `b` reaches `a`. Removing
// an edge only ever removes lines, which is what lets the baseline shrink one move at a time.
function cycleEdges(edges: Map<string, Set<string>>) {
	const reaches = (from: string, to: string) => {
		const seen = new Set<string>();
		const stack = [from];
		while (stack.length > 0) {
			const at = stack.pop()!;
			if (at === to) return true;
			if (seen.has(at)) continue;
			seen.add(at);
			stack.push(...(edges.get(at) ?? []));
		}
		return false;
	};

	return [...edges].flatMap(([from, targets]) =>
		[...targets].filter((to) => reaches(to, from)).map((to) => `${from} -> ${to} : cycle`)
	);
}

function violations() {
	const found = new Set<string>();
	const edges = new Map<string, Set<string>>();
	const kinds = RECORD_KINDS.map((kind) => ({ kind, owner: KIND_OWNER[kind] ?? kind }));

	for (const { file, label } of libraryFiles()) {
		const from = moduleOf(label);
		const fromLayer = LAYERS[from];
		const { script, all } = readSource(file);

		for (const specifier of valueImports(script)) {
			const target = resolve(file, specifier);
			if (target === undefined) continue;

			const to = moduleOf(target);
			const toLayer = LAYERS[to];
			if (to === from || toLayer === undefined) continue;

			if (!edges.has(from)) edges.set(from, new Set());
			edges.get(from)!.add(to);

			if (RANK[fromLayer] < RANK[toLayer]) found.add(`${label} -> ${target} : upward`);

			const declaration =
				from === COMPOSITION_ROOT && DECLARATIONS.includes(target.slice(to.length + 1));
			if (
				(toLayer === 'feature' || toLayer === 'capability') &&
				!isEntry(target, toLayer) &&
				!declaration
			) {
				found.add(`${label} -> ${target} : deep`);
			}

			if (toLayer === 'feature' && fromLayer !== 'feature' && from !== COMPOSITION_ROOT) {
				found.add(`${label} -> ${to} : import`);
			}
		}

		if (from === COMPOSITION_ROOT) continue;
		for (const { kind, owner } of kinds) {
			if (from !== owner && new RegExp(`(['"\`])${kind}\\1`).test(all)) {
				found.add(`${label} -> ${kind} : literal`);
			}
		}
	}

	for (const line of cycleEdges(edges)) found.add(line);

	return found;
}

function baseline() {
	return readFileSync(BASELINE, 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));
}

test('every home in the library has a layer', () => {
	const homes = readdirSync(LIB_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== 'tests')
		.map((entry) => entry.name);

	assert.deepEqual(
		homes.filter((home) => !(home in LAYERS)),
		[],
		'a home with no layer is checked by nothing; add it to LAYERS'
	);
});

test('every record kind belongs to a feature', () => {
	for (const kind of RECORD_KINDS) {
		assert.equal(LAYERS[KIND_OWNER[kind] ?? kind], 'feature', `the kind ${kind} has no feature`);
	}
});

test('the baseline is sorted and holds each violation once', () => {
	const lines = baseline();
	assert.deepEqual(lines, [...new Set(lines)].sort());
});

test('no import breaks the layers beyond the baseline', () => {
	const recorded = new Set(baseline());
	const added = [...violations()].filter((line) => !recorded.has(line)).sort();

	assert.deepEqual(added, [], 'a new violation of the four-layer rule; fix the import');
});

test('every baseline line still occurs, so the baseline only shrinks', () => {
	const found = violations();
	const gone = baseline().filter((line) => !found.has(line));

	assert.deepEqual(gone, [], 'a violation is gone; delete its line from layers.baseline.txt');
});
