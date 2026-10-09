import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sourceFiles } from '#tests/source.ts';

/**
 * The token layer holds two appearances, and this reads the file itself rather than a rendered
 * page: jsdom computes no colour, and what has to hold is a property of the values as written.
 *
 * Three things are asserted. Every colour token has a value in both blocks, since a token missing
 * from one silently falls back to the other appearance's value. The text a reader has to read,
 * the foreground, the muted foreground and each tone, meets WCAG AA (4.5:1) against each surface it
 * sits on, in both. And a label drawn on a filled tone meets it on that fill, solid and at the
 * alpha its hover paints the fill at over each surface. A toned toast's text is held to the same
 * on the wash the toaster mixes for it. A disabled button's label is held to 3:1, the floor for a
 * control that is shown but cannot run, against its own fill and every surface a button without
 * one sits on.
 */

const source = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

type Oklch = { l: number; c: number; h: number; alpha: number };
type Rgb = [number, number, number];

function block(selector: string): Map<string, Oklch> {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// indented where the block sits inside a media query, as the dark one does (screen only).
	const match = new RegExp(`^[\\t ]*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(source);

	assert.ok(match, `tokens.css declares a ${selector} block`);

	const values = new Map(
		[...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
	);
	const colours = new Map<string, Oklch>();

	for (const [name, value] of values) {
		// a fill may alias its text token in the same block, where that value already passes.
		const alias = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
		const colour = parseOklch(alias === undefined ? value : (values.get(alias) ?? ''));

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
function linear({ l, c, h }: Oklch): Rgb {
	const hue = (h * Math.PI) / 180;
	const a = c * Math.cos(hue);
	const b = c * Math.sin(hue);

	const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const clip = (channel: number) => Math.min(1, Math.max(0, channel));

	return [
		clip(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone),
		clip(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone),
		clip(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone)
	];
}

function luminance(colour: Oklch | Rgb) {
	const [red, green, blue] = Array.isArray(colour) ? colour : linear(colour);

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(one: Oklch | Rgb, other: Oklch | Rgb) {
	const [lighter, darker] = [luminance(one), luminance(other)].sort((x, y) => y - x);

	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A fill painted at an alpha over a ground, as linear sRGB.
 *
 * `bg-primary-fill/90` is the fill's colour at that alpha, and the browser blends it with what is
 * beneath in encoded sRGB, so the blend is taken there and decoded back for the luminance.
 */
function over(fill: Oklch, alpha: number, ground: Oklch): Rgb {
	const encode = (channel: number) =>
		channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
	const decode = (channel: number) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	const [red, green, blue] = linear(fill);
	const beneath = linear(ground);
	const blend = (channel: number, under: number) =>
		decode(alpha * encode(channel) + (1 - alpha) * encode(under));

	return [blend(red, beneath[0]), blend(green, beneath[1]), blend(blue, beneath[2])];
}

/**
 * `color-mix(in oklab, one weight, other)` for two opaque colours: a straight interpolation of the
 * oklab coordinates, returned in oklch so the luminance above reads it.
 */
function mix(one: Oklch, weight: number, other: Oklch): Oklch {
	const rectangular = ({ l, c, h }: Oklch) => {
		const hue = (h * Math.PI) / 180;

		return [l, c * Math.cos(hue), c * Math.sin(hue)];
	};
	const [l, a, b] = rectangular(one).map(
		(value, axis) => weight * value + (1 - weight) * rectangular(other)[axis]
	);

	return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI, alpha: 1 };
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
 * Every filled tone a label is drawn on, the label it takes, and each alpha a hover paints the fill
 * at. The fill is its own token beside the tone's text token: in dark no one value is light enough
 * to read as text on the surfaces and dark enough to carry a white label. A hover at an alpha lets
 * the surface through, which lightens the fill over a pale ground, so each hover is checked over
 * every surface as well as solid.
 */
const FILLS: { fill: string; label: string; hovers: number[] }[] = [
	{ fill: 'primary-fill', label: 'primary-foreground', hovers: [0.9] },
	{ fill: 'destructive-fill', label: 'destructive-foreground', hovers: [0.9] },
	{ fill: 'permitted-fill', label: 'permitted-foreground', hovers: [] }
];
const theme = /@theme inline\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';

/**
 * The disabled pair, as `primitive/button/button.svelte` draws it: the label in the disabled
 * foreground, on the muted fill a filled variant takes, or straight on the surface for a variant
 * with no fill of its own. The button is read too, so the pair asserted here is the one drawn.
 */
const DISABLED_LABEL = 'disabled-foreground';
const DISABLED_FILL = 'muted';
const button = readFileSync(new URL('../primitive/button/button.svelte', import.meta.url), 'utf8');

/**
 * The toned toasts, as `primitive/sonner/sonner.svelte` hands them to sonner: each type's wash is
 * a `color-mix` of its tone into a ground, and its text is a token. The primitive is read rather
 * than restated, so the mix asserted here is the one drawn, and a change to the percentage or to
 * either token is checked as it is written.
 */
const TOASTS = ['success', 'error', 'warning', 'info'];
const sonner = readFileSync(new URL('../primitive/sonner/sonner.svelte', import.meta.url), 'utf8');

function toast(type: string) {
	const wash = new RegExp(
		`--${type}-bg:\\s*color-mix\\(in oklab, var\\(--([\\w-]+)\\) ([\\d.]+)%, var\\(--([\\w-]+)\\)\\);`
	).exec(sonner);
	const text = new RegExp(`--${type}-text:\\s*var\\(--([\\w-]+)\\);`).exec(sonner);

	assert.ok(wash, `the ${type} toast's wash is a color-mix of a tone into a ground`);
	assert.ok(text, `the ${type} toast's text is a token`);

	return { tone: wash[1], weight: Number(wash[2]) / 100, ground: wash[3], text: text[1] };
}

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

describe('a label on a filled tone', () => {
	for (const { fill, label } of FILLS) {
		it(`maps --${fill} and --${label} to utilities`, () => {
			for (const name of [fill, label]) {
				assert.ok(theme.includes(`--color-${name}: var(--${name});`), `@theme maps --${name}`);
			}
		});
	}

	it('paints a fill only at an alpha the pairs check', () => {
		const painted = sourceFiles().flatMap(({ file, label }) =>
			[...readFileSync(file, 'utf8').matchAll(/bg-([\w-]+-fill)\/(\d+)/g)].map(
				([token, fill, percent]) => ({ label, token, fill, alpha: Number(percent) / 100 })
			)
		);
		const unchecked = painted.filter(
			({ fill, alpha }) => !FILLS.find((pair) => pair.fill === fill)?.hovers.includes(alpha)
		);

		assert.deepEqual(unchecked, [], 'a fill painted at an alpha no pair checks');
	});

	it('names the token it draws in, never white', () => {
		const white = sourceFiles().filter(({ file }) =>
			/\btext-white\b/.test(readFileSync(file, 'utf8'))
		);

		assert.deepEqual(
			white.map(({ label }) => label),
			[]
		);
	});

	for (const [appearance, tokens] of Object.entries(appearances)) {
		for (const { fill, label, hovers } of FILLS) {
			it(`${appearance}: --${label} reads at 4.5:1 on --${fill}, solid and hovered`, () => {
				const ink = tokens.get(label);
				const paint = tokens.get(fill);

				assert.ok(ink, `${appearance} declares --${label}`);
				assert.ok(paint, `${appearance} declares --${fill}`);

				const solid = contrast(ink, paint);

				assert.ok(solid >= 4.5, `${appearance} --${label} on --${fill} is ${solid.toFixed(2)}:1`);

				for (const alpha of hovers) {
					for (const surface of SURFACES) {
						const ground = tokens.get(surface);

						assert.ok(ground, `${appearance} declares --${surface}`);

						const ratio = contrast(ink, over(paint, alpha, ground));

						assert.ok(
							ratio >= 4.5,
							`${appearance} --${label} on --${fill} at ${alpha} over --${surface} is ${ratio.toFixed(2)}:1`
						);
					}
				}
			});
		}
	}
});

describe('a toned toast', () => {
	for (const [appearance, tokens] of Object.entries(appearances)) {
		for (const type of TOASTS) {
			it(`${appearance}: the ${type} toast's text reads at 4.5:1 on its wash`, () => {
				const { tone, weight, ground, text } = toast(type);
				const paint = tokens.get(tone);
				const beneath = tokens.get(ground);
				const ink = tokens.get(text);

				assert.equal(ground, 'popover', `the ${type} wash is mixed over the popover`);
				assert.ok(paint, `${appearance} declares --${tone}`);
				assert.ok(beneath, `${appearance} declares --${ground}`);
				assert.ok(ink, `${appearance} declares --${text}`);
				assert.ok(
					paint.alpha === 1 && beneath.alpha === 1,
					`${appearance} --${tone} and --${ground} are opaque, so the wash is`
				);

				const ratio = contrast(ink, mix(paint, weight, beneath));

				assert.ok(
					ratio >= 4.5,
					`${appearance} --${text} on the ${type} wash (--${tone} at ${weight} into --${ground}) is ${ratio.toFixed(2)}:1`
				);
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
