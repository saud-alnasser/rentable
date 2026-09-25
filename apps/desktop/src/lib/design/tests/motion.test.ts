import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sourceFiles } from '#tests/source.ts';

/**
 * Motion is spoken in the token layer's words and nowhere else in numbers.
 *
 * Every surface names a duration and an easing from the vocabulary in `@rentable/design`'s
 * `tokens.css`: `duration-quick`, `duration-base` or `duration-slow`, and `ease-enter`,
 * `ease-exit` or `ease-move`. A number written into a class is a surface deciding its own timing,
 * which is how the application came to run at seven different speeds, so this reads every file the
 * application draws with and fails on one.
 *
 * `packages/design/src/lib/tests/motion.test.ts` holds the package to the same rule, beside the
 * token layer that states the values. Each package scans its own tree and neither reaches across.
 */
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

function offences() {
	return sourceFiles(DRAWN).flatMap(({ file, label }) =>
		readFileSync(file, 'utf8')
			.split('\n')
			.flatMap((line, index) =>
				RAW_MOTION.filter(({ pattern }) => pattern.test(line)).map(
					({ pattern, instead }) =>
						`${label}:${index + 1} ${line.match(pattern)?.[0]}, use ${instead}`
				)
			)
	);
}

test('the application is read, so a pass is not a pass over nothing', () => {
	assert.ok(sourceFiles(DRAWN).some(({ label }) => label.endsWith('palette.svelte')));
});

test('no surface writes a duration or an easing of its own', () => {
	assert.deepEqual(offences(), []);
});
