import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { sourceFiles } from '#tests/source.ts';

/**
 * The motion vocabulary, as Tailwind builds it from the token layer.
 *
 * Compiled rather than read as text, because what a surface depends on is the utility and not
 * the declaration: a token stated in the file and missing from the build is a class that renders
 * nothing, and it renders nothing silently. The scan at the foot of this file is the other half:
 * it fails on a number wherever one of this package's surfaces is written, and
 * `apps/desktop/src/lib/design/tests/motion.test.ts` holds the application to the same rule. Each
 * package scans its own tree and neither reaches across.
 */
const TOKENS = fileURLToPath(new URL('../tokens.css', import.meta.url));
const require = createRequire(import.meta.url);

async function build(candidates: string[]) {
	const compiler = await compile(`@import 'tailwindcss';\n${readFileSync(TOKENS, 'utf8')}`, {
		base: dirname(TOKENS),
		loadStylesheet: async (id: string) => {
			const path = require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id);

			return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
		}
	});

	return compiler.build(candidates);
}

/** the body of the rule a selector opens in the built CSS, or null where none is built. */
function ruleFor(css: string, selector: string) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	return css.match(new RegExp(`(?:^|\\s)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

const VOCABULARY = {
	'--ease-enter': 'cubic-bezier(0, 0, 0.2, 1)',
	'--ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
	'--ease-move': 'cubic-bezier(0.2, 0, 0, 1)',
	'--duration-quick': '150ms',
	'--duration-base': '200ms',
	'--duration-slow': '250ms'
};

test('the six motion tokens are declared, with the values the vocabulary names', async () => {
	const css = await build([]);

	for (const [token, value] of Object.entries(VOCABULARY)) {
		assert.match(css, new RegExp(`${token}: ${value.replace(/[()]/g, '\\$&')};`), token);
	}
});

test('each duration is a utility, and it drives a transition and a keyframe entrance alike', async () => {
	const css = await build(['duration-quick', 'duration-base', 'duration-slow']);

	for (const name of ['quick', 'base', 'slow']) {
		const rule = ruleFor(css, `.duration-${name}`);

		assert.ok(rule, `duration-${name} builds nothing`);
		// tw-animate-css reads `--tw-duration`, so this is what reaches `animate-in` as well.
		assert.match(rule, new RegExp(`--tw-duration: var\\(--transition-duration-${name}\\)`));
		assert.match(css, new RegExp(`--transition-duration-${name}: var\\(--duration-${name}\\)`));
	}
});

test('each easing is a utility named for what the element is doing', async () => {
	const css = await build(['ease-enter', 'ease-exit', 'ease-move']);

	for (const name of ['enter', 'exit', 'move']) {
		const rule = ruleFor(css, `.ease-${name}`);

		assert.ok(rule, `ease-${name} builds nothing`);
		assert.match(rule, new RegExp(`--tw-ease: var\\(--ease-${name}\\)`));
	}
});

test('the stock easings build nothing, so a surface cannot reach one by accident', async () => {
	const css = await build(['ease-in', 'ease-out', 'ease-in-out']);

	for (const stock of ['ease-in', 'ease-out', 'ease-in-out']) {
		assert.equal(ruleFor(css, `.${stock}`), null, stock);
	}
});

test('a bare transition falls back on the vocabulary rather than on a number of its own', async () => {
	const css = await build([]);

	assert.match(css, /--default-transition-duration: var\(--duration-quick\);/);
	assert.match(css, /--default-transition-timing-function: var\(--ease-move\);/);
});

test('reduced motion stops the animation of every view transition pseudo-element', () => {
	const source = readFileSync(TOKENS, 'utf8');
	const block = source.slice(source.indexOf('@media (prefers-reduced-motion: reduce)'));

	for (const pseudo of ['group', 'image-pair', 'old', 'new']) {
		assert.ok(block.includes(`::view-transition-${pseudo}(*)`), pseudo);
	}

	assert.match(block, /::view-transition-new\(\*\)\s*\{\s*animation: none !important;/);
});

/** the files a surface is written in. */
const DRAWN = /\.(svelte|ts|js|css)$/;

/**
 * What a surface may not write, each with the word the vocabulary has for it instead. The token
 * layer is the one file that may state a value, since the value has to be stated somewhere, and
 * the tests above are what check it.
 */
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

function drawnFiles() {
	return sourceFiles(DRAWN).filter(({ file }) => file !== TOKENS);
}

test('the package is read, so a pass is not a pass over nothing', () => {
	assert.ok(drawnFiles().some(({ label }) => label.endsWith('sheet-content.svelte')));
});

test('no surface in the package writes a duration or an easing of its own', () => {
	const offences = drawnFiles().flatMap(({ file, label }) =>
		readFileSync(file, 'utf8')
			.split('\n')
			.flatMap((line, index) =>
				RAW_MOTION.filter(({ pattern }) => pattern.test(line)).map(
					({ pattern, instead }) =>
						`${label}:${index + 1} ${line.match(pattern)?.[0]}, use ${instead}`
				)
			)
	);

	assert.deepEqual(offences, []);
});
