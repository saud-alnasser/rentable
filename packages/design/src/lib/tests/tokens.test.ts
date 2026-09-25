import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The token layer holds two appearances, and this reads the file itself rather than a rendered
 * page: jsdom computes no colour, and what has to hold is a property of the values as written.
 *
 * Two things are asserted. Every colour token has a value in both blocks, since a token missing
 * from one silently falls back to the other appearance's value. And the text a reader has to read,
 * the foreground, the muted foreground and each tone, meets WCAG AA (4.5:1) against each surface it
 * sits on, in both. A disabled button's label is held to 3:1, the floor for a control that is
 * shown but cannot run, against its own fill and every surface a button without one sits on.
 */

const source = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

type Oklch = { l: number; c: number; h: number; alpha: number };

function block(selector: string): Map<string, Oklch> {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// indented where the block sits inside a media query, as the dark one does (screen only).
	const match = new RegExp(`^[\\t ]*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(source);

	assert.ok(match, `tokens.css declares a ${selector} block`);

	const colours = new Map<string, Oklch>();

	for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
		const colour = parseOklch(value.trim());

		if (colour) colours.set(name, colour);
	}

	return colours;
}

/** `oklch(L C H)` or `oklch(L C H / A%)`, with L as a fraction or a percentage. */
function parseOklch(value: string): Oklch | null {
	const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/.exec(
		value
	);

	if (!match) return null;

	const [, l, lPercent, c, h, alpha, alphaPercent] = match;

	return {
		l: Number(l) / (lPercent ? 100 : 1),
		c: Number(c),
		h: Number(h),
		alpha: alpha === undefined ? 1 : Number(alpha) / (alphaPercent ? 100 : 1)
	};
}

/**
 * The relative luminance WCAG defines, from an oklch colour.
 *
 * oklch to oklab is polar to rectangular; oklab to linear sRGB is Ottosson's published matrices.
 * WCAG's luminance is taken over linear sRGB, so no transfer function is needed on the way. A
 * channel outside the gamut is clipped, which is what a display does with it.
 */
function luminance({ l, c, h }: Oklch) {
	const hue = (h * Math.PI) / 180;
	const a = c * Math.cos(hue);
	const b = c * Math.sin(hue);

	const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const clip = (channel: number) => Math.min(1, Math.max(0, channel));
	const red = clip(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone);
	const green = clip(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone);
	const blue = clip(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone);

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(one: Oklch, other: Oklch) {
	const [lighter, darker] = [luminance(one), luminance(other)].sort((x, y) => y - x);

	return (lighter + 0.05) / (darker + 0.05);
}

const appearances = { light: block(':root'), dark: block('.dark') };

const TEXT = [
	'foreground',
	'muted-foreground',
	'destructive',
	'info',
	'warning',
	'success',
	'permitted',
	'money'
];
const SURFACES = ['background', 'card', 'popover'];

/**
 * The disabled pair, as `primitive/button/button.svelte` draws it: the label in the disabled
 * foreground, on the muted fill a filled variant takes, or straight on the surface for a variant
 * with no fill of its own. The button is read too, so the pair asserted here is the one drawn.
 */
const DISABLED_LABEL = 'disabled-foreground';
const DISABLED_FILL = 'muted';
const button = readFileSync(new URL('../primitive/button/button.svelte', import.meta.url), 'utf8');

describe('the luminance function', () => {
	it('puts white at one and black at zero, so white on black is 21:1', () => {
		const white = { l: 1, c: 0, h: 0, alpha: 1 };
		const black = { l: 0, c: 0, h: 0, alpha: 1 };

		assert.ok(Math.abs(luminance(white) - 1) < 1e-4);
		assert.ok(Math.abs(luminance(black)) < 1e-9);
		assert.ok(Math.abs(contrast(white, black) - 21) < 1e-2);
	});
});

describe('the two appearances', () => {
	it('declare the same colour tokens', () => {
		const light = [...appearances.light.keys()].sort();
		const dark = [...appearances.dark.keys()].sort();

		assert.ok(light.length > 0);
		assert.deepEqual(
			light.filter((name) => !dark.includes(name)),
			[],
			'declared in light and not in dark'
		);
		assert.deepEqual(
			dark.filter((name) => !light.includes(name)),
			[],
			'declared in dark and not in light'
		);
	});

	for (const [appearance, tokens] of Object.entries(appearances)) {
		for (const text of TEXT) {
			it(`${appearance}: ${text} reads at 4.5:1 on every surface`, () => {
				const foreground = tokens.get(text);

				assert.ok(foreground, `${appearance} declares --${text}`);

				for (const surface of SURFACES) {
					const ground = tokens.get(surface);

					assert.ok(ground, `${appearance} declares --${surface}`);

					const ratio = contrast(foreground, ground);

					assert.ok(
						ratio >= 4.5,
						`${appearance} --${text} on --${surface} is ${ratio.toFixed(2)}:1`
					);
				}
			});
		}
	}
});

describe('a disabled button', () => {
	it('is dimmed by the disabled pair rather than by opacity', () => {
		for (const state of ['disabled', 'aria-disabled']) {
			assert.ok(button.includes(`${state}:text-${DISABLED_LABEL}`), `${state} takes the label`);
			assert.ok(button.includes(`${state}:bg-${DISABLED_FILL}`), `${state} takes the fill`);
		}

		assert.doesNotMatch(button, /disabled:opacity-/);
	});

	for (const [appearance, tokens] of Object.entries(appearances)) {
		it(`${appearance}: its label reads at 3:1 on its fill and on every surface`, () => {
			const label = tokens.get(DISABLED_LABEL);

			assert.ok(label, `${appearance} declares --${DISABLED_LABEL}`);

			for (const ground of [DISABLED_FILL, ...SURFACES]) {
				const colour = tokens.get(ground);

				assert.ok(colour, `${appearance} declares --${ground}`);

				const ratio = contrast(label, colour);

				assert.ok(
					ratio >= 3,
					`${appearance} --${DISABLED_LABEL} on --${ground} is ${ratio.toFixed(2)}:1`
				);
			}
		});
	}
});
