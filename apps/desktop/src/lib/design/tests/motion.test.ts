import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Motion is spoken in the token layer's words and nowhere else in numbers.
 *
 * Every surface names a duration and an easing from the vocabulary in `@rentable/design`'s
 * `tokens.css`: `duration-quick`, `duration-base` or `duration-slow`, and `ease-enter`,
 * `ease-exit` or `ease-move`. A number written into a class is a surface deciding its own timing,
 * which is how the application came to run at seven different speeds, so this reads every file the
 * application draws with and fails on one.
 *
 * Both trees are read because both are drawn: the package's primitives and blocks are on screen as
 * much as this application's own components are, which is also why `app.css` registers the
 * package with `@source`. The token layer is the one file that may state a value, since the
 * value has to be stated somewhere, and the package's own test of it is the one that checks it.
 */
const DESKTOP_SRC = fileURLToPath(new URL('../../..', import.meta.url));
const DESIGN_SRC = fileURLToPath(new URL('../../../../../../packages/design/src', import.meta.url));
const REPOSITORY = fileURLToPath(new URL('../../../../../..', import.meta.url));
const TOKEN_LAYER = join(DESIGN_SRC, 'lib', 'tokens.css');
const TOKEN_TEST = join(DESIGN_SRC, 'lib', 'tests', 'motion.test.ts');
const THIS_FILE = fileURLToPath(import.meta.url);

const DRAWN = /\.(svelte|ts|js|css)$/;

/** what a surface may not write, each with the word the vocabulary has for it instead. */
const RAW_MOTION: { pattern: RegExp; instead: string }[] = [
	{ pattern: /(?<![\w-])duration-\d/, instead: 'duration-quick, -base or -slow' },
	{ pattern: /(?<![\w-])duration-\[/, instead: 'duration-quick, -base or -slow' },
	{ pattern: /(?<![\w-])animation-duration-/, instead: 'duration-quick, -base or -slow' },
	{
		pattern: /(?<![\w-])ease-(?:in-out|in|out|linear)(?![\w-])/,
		instead: 'ease-enter, -exit or -move'
	},
	{ pattern: /(?<![\w-])ease-\[/, instead: 'ease-enter, -exit or -move' },
	{ pattern: /cubic-bezier\(/, instead: 'ease-enter, -exit or -move' }
];

function drawnFiles(root: string) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && DRAWN.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))
		.filter((file) => ![TOKEN_LAYER, TOKEN_TEST, THIS_FILE].includes(file));
}

function offences() {
	return [...drawnFiles(DESKTOP_SRC), ...drawnFiles(DESIGN_SRC)].flatMap((file) =>
		readFileSync(file, 'utf8')
			.split('\n')
			.flatMap((line, index) =>
				RAW_MOTION.filter(({ pattern }) => pattern.test(line)).map(
					({ pattern, instead }) =>
						`${relative(REPOSITORY, file).split(sep).join('/')}:${index + 1} ` +
						`${line.match(pattern)?.[0]}, use ${instead}`
				)
			)
	);
}

test('both trees the application draws with are read, so a pass is not a pass over nothing', () => {
	assert.ok(drawnFiles(DESKTOP_SRC).some((file) => file.endsWith('palette.svelte')));
	assert.ok(drawnFiles(DESIGN_SRC).some((file) => file.endsWith('sheet-content.svelte')));
});

test('no surface writes a duration or an easing of its own', () => {
	assert.deepEqual(offences(), []);
});
