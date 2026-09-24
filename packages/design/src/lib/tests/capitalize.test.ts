// Ticket 28 of effort 832: no text transform changes what a person typed or what the words are.
//
// The CSS `capitalize` raises the first letter of every word, so on a person's own value it
// changes the value, and on a title with a joining word in it, it writes "Link And Code". A
// packaged block is handed its words, so it cannot know which they are: a title goes through
// `toTitleCase` (`title-case.ts`), and a legend is sentence case.
//
// `apps/desktop/src/lib/design/tests/capitalize.test.ts` holds the application to the same rule.
// Each package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SOURCE = /\.(svelte|ts|js|css|html)$/;

/** the class itself, and not `autocapitalize` or a word that merely contains it. */
const CAPITALIZE = /(?<![\w-])capitalize(?![\w-])/g;

/** Where `capitalize` may stay, how many times at most, and why. */
const ALLOWED: readonly { label: string; most: number; reason: string }[] = [
	{
		label: 'lib/block/section-switch.svelte',
		most: 1,
		reason: 'a section’s name, one word from the caller’s locale: "details", "payments", "general"'
	}
];

function toPosix(path: string) {
	return path.split(sep).join('/');
}

/** the source with its comments taken out: a comment may name the class it explains. */
function withoutComments(text: string) {
	return text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '');
}

// every source file under `src/`, labelled from there. A `tests/` directory is left out: it
// covers the rule rather than obeying it, and this file names the class it forbids.
function sourceFiles() {
	return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && SOURCE.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SRC_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}

describe('capitalize', () => {
	it('sits only where the allowlist says, and no more often', () => {
		const offenders = sourceFiles().flatMap(({ file, label }) => {
			const count = [...withoutComments(readFileSync(file, 'utf8')).matchAll(CAPITALIZE)].length;
			const allowed = ALLOWED.find((entry) => entry.label === label)?.most ?? 0;

			return count > allowed ? [`${label}: ${count}, allowed ${allowed}`] : [];
		});

		assert.deepEqual(
			offenders,
			[],
			'a title takes toTitleCase; a person’s value takes no transform'
		);
	});

	it('names only files that exist, each with its reason', () => {
		for (const entry of ALLOWED) {
			assert.ok(existsSync(join(SRC_ROOT, entry.label)), `no such file: ${entry.label}`);
			assert.ok(entry.reason.trim().length > 0, `${entry.label} gives no reason`);
		}
	});
});
