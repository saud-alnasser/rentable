import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * EVERY TOAST GOES THROUGH THE NOTIFICATION CAPABILITY
 *
 * Requirement 12 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: a surface
 * never raises a toast itself. It reports through the mutation handlers in `design/mutation.ts`,
 * or through `$lib/notification` for what no mutation stands behind, and the handlers raise
 * through `$lib/notification` too (requirement 20 of
 * [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]). So `notification.ts` is the
 * only module that imports `toast`, and `notification/` the only home that mounts the packaged
 * `Toaster`. This reads the tree rather than trusting that nobody reached for either again.
 *
 * What is looked for is `toast` itself, whether named, default or a namespace. The toaster the
 * layout mounts is imported from the same package and is not a toast, so it is not caught by the
 * first scan; the second looks for the packaged toaster by its path.
 */

const here = fileURLToPath(import.meta.url);
const desktop = join(here, '..', '..', '..', '..', '..');
const repository = join(desktop, '..', '..');

const ROOTS = [join(desktop, 'src'), join(repository, 'packages', 'design', 'src')];

const SHARED_HANDLERS = new Set(['apps/desktop/src/lib/notification/notification.ts']);

const NOTIFICATION = 'apps/desktop/src/lib/notification/';

const SKIP = new Set(['node_modules', '.svelte-kit']);
const SOURCE = /\.(ts|js|svelte)$/;

// every import of the design package's toaster, from outside the package that defines it.
const TOASTER = /from\s+['"]@rentable\/design\/primitive\/sonner(\/[^'"]*)?['"]/;

// every static import of the package, with the clause between `import` and `from`.
const IMPORT = /import\s+([^;]*?)\s+from\s+['"]svelte-sonner['"]/g;
// and a dynamic one, which has no clause to read and is counted whatever it takes.
const DYNAMIC = /import\(\s*['"]svelte-sonner['"]\s*\)/;

/** whether an import clause brings `toast` in, under its own name or any other. */
function takesToast(clause: string) {
	if (/\*\s+as\s+/.test(clause)) return true;
	// a default import is whatever precedes the braces.
	if (/^\s*[A-Za-z_$][\w$]*\s*(,|$)/.test(clause) && !/^\s*type\s/.test(clause)) return true;

	const named = clause.match(/\{([^}]*)\}/)?.[1] ?? '';

	return named
		.split(',')
		.map((name) => name.trim())
		.some((name) => /^toast(\s+as\s+[\w$]+)?$/.test(name));
}

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

async function importersOfToast() {
	const found: string[] = [];

	for (const root of ROOTS) {
		for await (const path of files(root)) {
			if (path === here) continue;

			const text = await readFile(path, 'utf8');
			const clauses = [...text.matchAll(IMPORT)].map((match) => match[1]);

			if (clauses.some(takesToast) || DYNAMIC.test(text)) {
				found.push(relative(repository, path).split(sep).join('/'));
			}
		}
	}

	return found;
}

test('no module but the shared handlers imports toast', async () => {
	const offenders = (await importersOfToast()).filter((path) => !SHARED_HANDLERS.has(path));

	assert.deepEqual(offenders, [], 'a toast is raised outside the shared handlers');
});

// the check above passes as readily against a scanner that finds nothing, so it is anchored to
// the one import that is meant to be there.
test('the shared handlers are what the scan finds', async () => {
	assert.deepEqual((await importersOfToast()).sort(), [...SHARED_HANDLERS].sort());
});

async function importersOfToaster() {
	const found: string[] = [];

	for await (const path of files(join(desktop, 'src'))) {
		if (path === here) continue;

		if (TOASTER.test(await readFile(path, 'utf8'))) {
			found.push(relative(repository, path).split(sep).join('/'));
		}
	}

	return found;
}

test('only the notification capability mounts the packaged toaster', async () => {
	const found = await importersOfToaster();

	assert.notDeepEqual(found, [], 'the provider mounts the toaster, so the scan finds it');
	assert.deepEqual(
		found.filter((path) => !path.startsWith(NOTIFICATION)),
		[],
		'the packaged toaster is mounted outside notification/'
	);
});

test('an import clause is read for toast in every shape it can take', () => {
	assert.equal(takesToast('{ toast }'), true);
	assert.equal(takesToast('{ Toaster, toast as announce }'), true);
	assert.equal(takesToast('* as sonner'), true);
	assert.equal(takesToast('sonner'), true);
	assert.equal(takesToast('{ Toaster as Sonner, type ToasterProps as SonnerProps }'), false);
	assert.equal(takesToast('type { ToasterProps }'), false);
});
