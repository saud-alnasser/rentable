// Holds `.aep/contexts/desktop/components.md` to the design tree (ticket 22 of effort 846): every
// primitive family, every block and every cell is named there, so a component added without
// saying what it is for, and when not to draw it, fails here rather than going unchosen or
// chosen by habit. [[rules/interface]] makes reading that context binding.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../../../..', import.meta.url));
const CONTEXT = readFileSync(`${REPOSITORY}/.aep/contexts/desktop/components.md`, 'utf8');

/** the `.svelte` files directly in a directory, without their extension. */
function svelteFiles(directory: string): string[] {
	return readdirSync(`${REPOSITORY}/${directory}`, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
		.map((entry) => entry.name.replace(/\.svelte$/, ''));
}

/** the directories directly in a directory, the tests folder aside. */
function directories(directory: string): string[] {
	return readdirSync(`${REPOSITORY}/${directory}`, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== 'tests')
		.map((entry) => entry.name);
}

/**
 * whether the context names `reference` as a whole name, so `primitive/toggle` is not found
 * inside `primitive/toggle-group`.
 */
function names(reference: string): boolean {
	const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`${escaped}(?![\\w-])`).test(CONTEXT);
}

function unnamed(references: string[]): string[] {
	return references.filter((reference) => !names(reference));
}

test('every primitive family is named in the components context', () => {
	const families = directories('packages/design/src/lib/primitive');
	assert.ok(families.length > 0);
	assert.deepEqual(unnamed(families.map((family) => `primitive/${family}`)), []);
});

test('every block is named in the components context', () => {
	const blocks = svelteFiles('packages/design/src/lib/block');
	assert.ok(blocks.length > 0);
	assert.deepEqual(unnamed(blocks.map((block) => `block/${block}.svelte`)), []);
	assert.deepEqual(
		unnamed(
			svelteFiles('apps/desktop/src/lib/design/block').map(
				(block) => `design/block/${block}.svelte`
			)
		),
		[]
	);
});

test('every cell is named in the components context', () => {
	const cells = svelteFiles('apps/desktop/src/lib/design/cell');
	assert.ok(cells.length > 0);
	assert.deepEqual(unnamed(cells.map((cell) => `cell/${cell}.svelte`)), []);
});
