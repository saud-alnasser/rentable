// Pins the package's shape and elevation: every corner is a step of the token layer's radius
// ladder, every shadow one of its two heights (and the one inset), and each shadow carries a value
// in both appearances.
//
// The ladder and the heights are checked as Tailwind builds them, because a step stated in the
// file and missing from the build is a class that renders nothing, silently. The source scan reads
// this package's tree; `apps/desktop/src/lib/design/tests/shape.test.ts` holds the same scan for
// the application, and neither reaches across.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { sourceFiles } from '#tests/source.ts';
import { cn } from '../tailwind.ts';

const LIB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOKENS = join(LIB_ROOT, 'tokens.css');
const require = createRequire(import.meta.url);

function occurrences(pattern: RegExp) {
	return sourceFiles().flatMap(({ file, label }) =>
		[...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({ label, token: match[0] }))
	);
}

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

/** the custom properties one appearance block of the token layer declares, by name. */
function appearance(selector: string) {
	const source = readFileSync(TOKENS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const body = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(source)?.[1];

	assert.ok(body, `tokens.css declares a ${selector} block`);

	return new Map(
		[...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value])
	);
}

const LADDER = {
	xs: '0.125rem',
	sm: '0.25rem',
	md: '0.375rem',
	lg: '0.5rem',
	xl: '0.75rem',
	'2xl': '1rem',
	'3xl': '1.5rem'
};

const ELEVATION = ['elevation-raised', 'elevation-overlay', 'elevation-sunken'];

describe('the radius ladder', () => {
	it('builds each step from the token layer', async () => {
		const css = await build(Object.keys(LADDER).map((step) => `rounded-${step}`));

		for (const [step, value] of Object.entries(LADDER)) {
			assert.match(ruleFor(css, `.rounded-${step}`) ?? '', new RegExp(`var\\(--radius-${step}\\)`));
			assert.match(css, new RegExp(`--radius-${step}: ${value.replace('.', '\\.')};`));
		}
	});

	it('builds nothing for a step it does not name', async () => {
		const css = await build(['rounded', 'rounded-4xl']);

		assert.equal(ruleFor(css, '.rounded'), null);
		assert.equal(ruleFor(css, '.rounded-4xl'), null);
	});

	it('lets an overlaid element take its parent’s corner', async () => {
		const css = await build(['rounded-inherit']);

		assert.match(ruleFor(css, '.rounded-inherit') ?? '', /border-radius: inherit/);
	});
});

describe('the two heights', () => {
	it('are declared once per appearance', () => {
		for (const selector of [':root', '.dark']) {
			const block = appearance(selector);

			for (const name of ELEVATION) {
				assert.ok(block.has(name), `${selector} declares no --${name}`);
			}
		}
	});

	it('differ between light and dark, since one alpha cannot read on both grounds', () => {
		const light = appearance(':root');
		const dark = appearance('.dark');

		for (const name of ['elevation-raised', 'elevation-overlay']) {
			assert.notEqual(light.get(name), dark.get(name), `--${name} is the same in both`);
		}
	});

	it('are utilities that read the appearance’s value', async () => {
		const css = await build(['shadow-raised', 'shadow-overlay', 'inset-shadow-sunken']);

		assert.match(ruleFor(css, '.shadow-raised') ?? '', /--tw-shadow: var\(--elevation-raised\)/);
		assert.match(ruleFor(css, '.shadow-overlay') ?? '', /--tw-shadow: var\(--elevation-overlay\)/);
		assert.match(
			ruleFor(css, '.inset-shadow-sunken') ?? '',
			/--tw-inset-shadow: var\(--elevation-sunken\)/
		);
	});

	it('are the only shadows Tailwind builds', async () => {
		const stock = [
			'shadow',
			'shadow-xs',
			'shadow-sm',
			'shadow-md',
			'shadow-lg',
			'shadow-xl',
			'shadow-2xl',
			'shadow-inner',
			'inset-shadow-sm',
			'drop-shadow-md',
			'text-shadow-md'
		];
		const css = await build(stock);

		for (const candidate of stock) {
			assert.equal(ruleFor(css, `.${candidate}`), null, `${candidate} still builds`);
		}
	});
});

describe('the package’s surfaces', () => {
	it('use no arbitrary radius', () => {
		assert.deepEqual(
			occurrences(/\brounded(?:-[a-z]{1,2})?-\[[^\]]*\]/g),
			[],
			'use a step of the ladder in [[rules/frontend]] *Styling*, or rounded-inherit'
		);
	});

	it('use no arbitrary shadow', () => {
		assert.deepEqual(
			occurrences(/\bshadow-\[[^\]]*\]/g),
			[],
			'use shadow-raised, shadow-overlay or inset-shadow-sunken'
		);
	});
});

describe('the class merge', () => {
	it('lets a later height or step replace an earlier one', () => {
		assert.equal(cn('shadow-raised', 'shadow-overlay'), 'shadow-overlay');
		assert.equal(cn('shadow-overlay', 'shadow-none'), 'shadow-none');
		assert.equal(cn('inset-shadow-sunken', 'inset-shadow-none'), 'inset-shadow-none');
		assert.equal(cn('rounded-2xl', 'rounded-inherit'), 'rounded-inherit');
	});

	it('keeps a height beside a shadow colour', () => {
		assert.equal(cn('shadow-raised', 'shadow-primary'), 'shadow-raised shadow-primary');
	});
});
