// Pins the four-layer rule of effort 840 (plan, *Architecture*) across `src/lib/`: foundation,
// capabilities, features, composition. Imports point down, or sideways through an entry; never
// up, and never in a cycle. It reads the tree as text with `node:fs`, the way
// `api/tests/boundaries.test.ts` does, so it adds no dependency.
//
// A violation is one line of `layers.baseline.txt`, `from -> to : kind`, and there are six kinds:
//
//   upward   file -> file       a module imports one in a higher layer
//   cycle    module -> module   an edge of the module graph that lies on a cycle
//   deep     file -> file       an import past a feature's or capability's entry
//   import   file -> feature    a feature imported by a home that is neither a feature nor `app/`
//   literal  file -> kind       a record kind spelled as a literal outside its feature and `app/`
//   route    route -> file      a `src/routes/` file importing past a component and the root
//
// The last is the routes' own rule (criterion 17): a route composes and holds no wiring, so it
// imports only a home's components (`$lib/<home>/.../component/...`), a home's `ui.ts`
// (`$lib/<home>/ui`) and the composition root (`$lib/app/...`), besides `$app/*`, third-party
// code, its own files and the stylesheet. Anything else it needs is a component's to reach. A
// route is labelled from `src/`, so its line reads `routes/... -> <library label> : route`.
//
// The last two are one rule, that the shell and the mechanisms hold no per-feature list
// (requirement 2). A feature may import another feature's entry, since requirement 4 has
// features talk through their public APIs; one reaching past that entry is a `deep` line, and
// is not counted again as `import`. A deep import is judged against features and capabilities,
// the homes requirement 4 gives a public API. A home's entry is its `index.ts`, which loads under
// Node, and it has a second one, `ui.ts`, which re-exports by name what of it only the window
// loads: the query hooks, rune state and components other concepts use (plan, *A feature has the
// same two entries*). Its `component/` stays private, so reaching into it from outside is `deep`,
// as is reaching any other file past the two. `app/` may also read a feature's `feature.ts`
// and `surface.ts`, which is how it lists them, and its `tauri.ts`, which is how `app/host.ts`
// binds the feature's host port to its adapter.
//
// A type-only import (`import type`, `export type`, a named list all of inline `type`) is held to
// the same rule, since a type is reached through an entry like anything else: it counts for
// `upward`, `deep` and `import`, and a type another concept shares goes in its `index.ts`. It
// has one exemption, an upward type import of the composition root, `app/`: the typed client,
// the feature contract and the capabilities that read the list are typed from it (`AppRouter`,
// `SurfaceContributions`, the feature list, the refusal codes), and the import is erased before
// anything runs (`rules/module-layout`, under *Where a concept departs from the shape*). Being
// erased, a type-only import is no edge of the module graph, so it lies on no `cycle`; and a
// route's imports are judged at runtime only.
//
// A feature's declaration files, `feature.ts` and `surface.ts`, may spell another's kind: they
// are where it names what it contributes to, a section drawn on a tenant's page or what a tenant's
// router reads of the contracts naming it (plan, *A feature's reverse needs are contributions*).
// That is one place per feature, read only by `app/`, and a kind spelled in any other module of
// it is still a `literal` line.
//
// Two spellings of a kind's word are not a kind at all, and count as no line: an option handed to
// an `Intl` constructor (`new Intl.ListFormat(locale, { type: 'unit' })`, where `unit` is the list's
// style), and the value of a `data-` attribute (`data-receipt-label="tenant"`), which names a part
// of the markup for a test to find. `kindSpelled` is the one judge, and a test below holds it to
// both sides.
//
// Two homes name the kinds by design, outside any feature, and a kind spelled there is no `literal`
// line either: the ones criterion 2 of effort 840 lists among what adding a kind edits. The schema
// (`platform/database/schema.ts`) names a table for each kind, and those names are stored, so they
// keep their spelling. The locale (`i18n/<locale>/index.ts`, and `i18n/i18n-types.ts` generated
// from the base one) carries a kind's word as a label and names the values a sentence is built
// from, a tenant among them.
//
// A locale is the other place that reads every concept: `i18n/<locale>/index.ts` composes each
// concept's `i18n/<locale>.ts` back at its key path (plan, *Integration*). Such a piece is data
// that imports nothing at runtime, which a test below holds it to, so the locale reading it is
// not an edge of the module graph and counts as no kind: nothing can run back through a leaf.
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
const SOURCE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ROUTES_ROOT = join(SOURCE_ROOT, 'routes');

type Layer = 'foundation' | 'capability' | 'feature' | 'composition';

const RANK: Record<Layer, number> = { foundation: 1, capability: 2, feature: 3, composition: 4 };

// Every top-level directory of `src/lib/` placed by hand, with its layer, as plan.md's
// *Components* tree assigns it: the foundation, the capabilities and the composition. Homes the
// effort has not created yet are listed already, so a ticket creating one finds its layer here;
// one that creates a home the plan does not name adds it. A feature is not placed here: see
// `LAYERS` below.
const PLACED: Record<string, Layer> = {
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

	// 4 composition: `app/` is the composition root, the one place that names every feature
	app: 'composition',
	prototype: 'composition',
	shell: 'composition'
};

const COMPOSITION_ROOT = 'app';

// The composition root's two lists, which name every feature and capability it reads.
const ROOT_LISTS = ['features.ts', 'surfaces.ts'];

// Every home whose declaration, its `feature.ts` or its `surface.ts`, one of the composition root's
// lists imports.
function listedHomes() {
	return ROOT_LISTS.flatMap((name) =>
		valueImports(readSource(join(LIB_ROOT, COMPOSITION_ROOT, name)).script)
	).flatMap((specifier) => /^\$lib\/([^/]+)\/(?:feature|surface)$/.exec(specifier)?.[1] ?? []);
}

// Every top-level directory's layer: 3, a feature, for every home the composition root lists that
// is not placed above, so adding a feature to the list is what gives its home a layer; and the
// placed layer for the rest, a capability the list also names among them. A home neither placed
// nor listed has none, and the first test below refuses it.
const LAYERS: Record<string, Layer> = {
	...Object.fromEntries(listedHomes().map((home) => [home, 'feature' as const])),
	...PLACED
};

// The feature a record kind belongs to, where it is not the feature of the same name.
const KIND_OWNER: Record<string, string> = { unit: 'complex' };

// What the composition root reads from a feature besides its entry (plan, *Components*): its two
// declarations, and the Tauri adapter `app/host.ts` binds its host port to.
const DECLARATIONS = ['feature.ts', 'surface.ts', 'tauri.ts'];

// A feature's or a capability's declaration files, where it names the kinds it contributes to.
const CONTRIBUTING = ['feature.ts', 'surface.ts'];

// Whether a file is one of its home's declarations, at any depth: a sub-concept declares itself
// beside its parent's (`complex/unit/surface.ts`).
function isDeclaration(label: string, layer: Layer) {
	const name = label.split('/').at(-1) ?? '';
	return (layer === 'feature' || layer === 'capability') && CONTRIBUTING.includes(name);
}

// The files that name the kinds by design, as the header says: the schema and the locale.
const NAMES_KINDS = [
	/^platform\/database\/schema\.ts$/,
	/^i18n\/[a-z]+\/index\.ts$/,
	/^i18n\/i18n-types\.ts$/
];

// A concept's strings for one locale, and the locale index that composes them.
const LOCALE_PIECE = /^(?!i18n\/)(?:[^/]+\/)+i18n\/([a-z]+)\.ts$/;
const LOCALE_INDEX = /^i18n\/([a-z]+)\/index\.ts$/;

// Whether an import is a locale index reading a piece of its own locale.
function isLocalePiece(label: string, target: string) {
	const locale = LOCALE_INDEX.exec(label)?.[1];
	return locale !== undefined && LOCALE_PIECE.exec(target)?.[1] === locale;
}

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

// Every specifier the script imports: static imports and re-exports, side-effect imports and
// dynamic imports, each marked with whether it is erased. `import type`, `export type`, and a
// named list whose every specifier is inline `type` are type-only; the other two never are.
function imports(script: string) {
	const found: { specifier: string; typeOnly: boolean }[] = [];

	const statement = /(?:^|[;\s}])(?:import|export)\s+([^;'"`]*?)\s*from\s*(['"])([^'"]+)\2/g;
	for (const [, clause, , specifier] of script.matchAll(statement)) {
		const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
		const names = named?.[1]
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);
		const typeOnly =
			/^type\s/.test(clause) ||
			(names !== undefined && names.length > 0 && names.every((name) => /^type\s/.test(name)));

		found.push({ specifier, typeOnly });
	}

	for (const [, , specifier] of script.matchAll(/(?:^|[;\s])import\s*(['"])([^'"]+)\1/g)) {
		found.push({ specifier, typeOnly: false });
	}
	for (const [, , specifier] of script.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
		found.push({ specifier, typeOnly: false });
	}

	return found;
}

// Every specifier the script imports at runtime, the erased ones left out.
function valueImports(script: string) {
	return imports(script)
		.filter(({ typeOnly }) => !typeOnly)
		.map(({ specifier }) => specifier);
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

// Whether a label is its home's entry: the home's `index.ts`, or its `ui.ts`.
function isEntry(label: string) {
	const parts = label.split('/');
	if (parts.length === 1) return true;
	if (parts.length !== 2) return false;
	return /^index\.(ts|js)$/.test(parts[1]) || parts[1] === 'ui.ts';
}

// Whether `code` spells `kind` as a literal: a quoted string that is the kind's word, other than
// an option handed to an `Intl` constructor or a `data-` attribute's value, as the header says.
function kindSpelled(code: string, kind: string) {
	const quoted = `(['"\`])${kind}\\1`;
	const kept = code
		.replace(/new\s+Intl\.\w+\([^()]*\)/g, '')
		.replace(new RegExp(`\\bdata-[\\w-]+=\\{?\\s*${quoted}\\s*\\}?`, 'g'), '');

	return new RegExp(quoted).test(kept);
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

// Every source file under `src/routes/`, labelled from `src/`, its tests aside as the library's
// are.
function routeFiles() {
	return readdirSync(ROUTES_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|js|svelte)$/.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SOURCE_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}

// What a route may reach in the library, by the label its import resolves to: a component at any
// depth of a home, a capability's `ui.ts`, and anything of the composition root.
function routeMayImport(target: string) {
	const parts = target.split('/');
	return (
		moduleOf(target) === COMPOSITION_ROOT ||
		parts.slice(1, -1).includes('component') ||
		(parts.length === 2 && parts[1] === 'ui.ts')
	);
}

// Each import of a route that reaches into the library past what `routeMayImport` allows.
// A specifier that leaves `src/lib/` is `$app/*`, third-party code, or the route's own files.
function routeViolations() {
	return routeFiles().flatMap(({ file, label }) =>
		valueImports(readSource(file).script)
			.map((specifier) => resolve(file, specifier))
			.filter((target): target is string => target !== undefined && !routeMayImport(target))
			.map((target) => `${label} -> ${target} : route`)
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

		for (const { specifier, typeOnly } of imports(script)) {
			const target = resolve(file, specifier);
			if (target === undefined) continue;

			const to = moduleOf(target);
			const toLayer = LAYERS[to];
			if (to === from || toLayer === undefined || isLocalePiece(label, target)) continue;

			// an erased import runs nothing, so no cycle runs through it.
			if (!typeOnly) {
				if (!edges.has(from)) edges.set(from, new Set());
				edges.get(from)!.add(to);
			}

			// the one exemption: a type read up from the composition root, as the header says.
			const typedFromRoot = typeOnly && to === COMPOSITION_ROOT;
			if (RANK[fromLayer] < RANK[toLayer] && !typedFromRoot) {
				found.add(`${label} -> ${target} : upward`);
			}

			const declaration =
				from === COMPOSITION_ROOT && DECLARATIONS.includes(target.slice(to.length + 1));
			if ((toLayer === 'feature' || toLayer === 'capability') && !isEntry(target) && !declaration) {
				found.add(`${label} -> ${target} : deep`);
			}

			if (toLayer === 'feature' && fromLayer !== 'feature' && from !== COMPOSITION_ROOT) {
				found.add(`${label} -> ${to} : import`);
			}
		}

		if (
			from === COMPOSITION_ROOT ||
			isDeclaration(label, fromLayer) ||
			NAMES_KINDS.some((names) => names.test(label))
		) {
			continue;
		}
		for (const { kind, owner } of kinds) {
			if (from !== owner && kindSpelled(all, kind)) {
				found.add(`${label} -> ${kind} : literal`);
			}
		}
	}

	for (const line of cycleEdges(edges)) found.add(line);
	for (const line of routeViolations()) found.add(line);

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

test('a locale piece imports nothing at runtime', () => {
	const importing = libraryFiles()
		.filter(({ label }) => LOCALE_PIECE.test(label))
		.filter(({ file }) => valueImports(readSource(file).script).length > 0)
		.map(({ label }) => label);

	assert.deepEqual(importing, [], 'a locale piece is data; import only types into it');
});

test('a kind is spelled as a string, but not as an Intl option or a data attribute', () => {
	assert.equal(kindSpelled("memberPermissions.views('unit')", 'unit'), true);
	assert.equal(kindSpelled('const kind = "tenant";', 'tenant'), true);
	assert.equal(kindSpelled("{ kind: 'unit' }", 'unit'), true);
	assert.equal(
		kindSpelled("new Intl.ListFormat(locale, { type: 'unit' }).format(x)", 'unit'),
		false
	);
	assert.equal(kindSpelled('<dt data-receipt-label="tenant">', 'tenant'), false);
	assert.equal(kindSpelled("<dt data-receipt-label={'tenant'}>", 'tenant'), false);
	assert.equal(
		kindSpelled("new Intl.ListFormat(locale, { type: 'unit' }); views('unit')", 'unit'),
		true
	);
});

test('an import is type-only where every name it brings is a type', () => {
	const marked = (script: string) => imports(script).map(({ typeOnly }) => typeOnly);

	assert.deepEqual(marked("import type { Host } from '$lib/app/host';"), [true]);
	assert.deepEqual(marked("export type { Host } from '$lib/app/host';"), [true]);
	assert.deepEqual(marked("import { type A, type B } from '$lib/sync';"), [true]);
	assert.deepEqual(marked("import { a, type B } from '$lib/sync';"), [false]);
	assert.deepEqual(marked("import a from '$lib/sync';"), [false]);
	assert.deepEqual(marked("import '$lib/app/surfaces';"), [false]);
	assert.deepEqual(marked("await import('$lib/sync');"), [false]);
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
