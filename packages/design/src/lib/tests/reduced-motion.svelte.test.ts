import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import DialogHarness from '#tests/dialog-harness.svelte';
import RecordCardHarness from '#tests/record-card-harness.svelte';
import SheetHarness from '#tests/sheet-harness.svelte';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Component } from 'svelte';
import { expect, test } from 'vitest';

/**
 * With reduced motion on, nothing translates, scales or fades.
 *
 * jsdom evaluates no media query and computes no animation, so what this reads is the two things
 * that decide it together: the reduced-motion block in `tokens.css`, taken as though its query
 * matched, and the classes each surface actually rendered. A surface's motion is stopped when the
 * block reaches the element carrying it, or when the surface gated the motion itself with
 * `motion-safe:`. Anything else would still move, and that is the failure.
 *
 * Three kinds of motion are told apart, because the block stops each by a different rule:
 *
 * - a keyframe entrance or exit (`animate-in`, `animate-out`), which carries the fade, the zoom
 *   and the slide. The block turns animation off on what bits-ui marks with `data-state`.
 * - a transition, which the block collapses to no time on every element.
 * - a transform a pointer applies, such as a hover lift. No rule can make one not move, so the
 *   surface has to gate it.
 */
// resolved from the package root, which is where Vitest runs: under jsdom `URL` is the
// environment's own class, and `readFileSync` refuses one of those as a file address.
const TOKENS = readFileSync(resolve(process.cwd(), 'src/lib/tokens.css'), 'utf8');
const REDUCED = TOKENS.slice(TOKENS.indexOf('@media (prefers-reduced-motion: reduce)'));

/** the rules inside the reduced-motion block, as a selector list and its declarations. */
const reducedRules = [...REDUCED.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
	selectors: selectors!
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split(',')
		.map((selector) => selector.trim()),
	body: body!
}));

/** the selectors the block stops keyframe animation on, where the query matches. */
const animationStoppedOn = reducedRules
	.filter(({ body }) => /animation:\s*none/.test(body))
	.flatMap(({ selectors }) => selectors)
	.filter((selector) => !selector.startsWith('::'));

const transitionsCollapse = reducedRules.some(
	({ selectors, body }) =>
		selectors.includes('*') && /transition-duration:\s*0s\s*!important/.test(body)
);

/** a class's variants and its utility, `motion-safe:hover:-translate-y-1` as both halves. */
function parse(token: string) {
	const parts = token.split(/:(?![^[]*\])/);

	return { variants: parts.slice(0, -1), utility: parts.at(-1)! };
}

type Motion = { element: Element; token: string; kind: 'keyframe' | 'transition' | 'pointer' };

/** every class in the document that would move something, with the kind of motion it is. */
function motionIn(root: ParentNode): Motion[] {
	return [...root.querySelectorAll('[class]')].flatMap((element) =>
		[...element.classList].flatMap((token): Motion[] => {
			const { variants, utility } = parse(token);

			if (/^animate-(in|out)$/.test(utility)) {
				return [{ element, token, kind: 'keyframe' }];
			}

			if (/^transition(-|$)/.test(utility)) {
				return [{ element, token, kind: 'transition' }];
			}

			if (
				/^-?(translate|scale|rotate)-/.test(utility) &&
				variants.some((variant) => /^(hover|active|focus|group-hover)/.test(variant))
			) {
				return [{ element, token, kind: 'pointer' }];
			}

			return [];
		})
	);
}

/** whether reduced motion stops this motion, and so whether it is allowed to be here. */
function stopped({ element, token, kind }: Motion) {
	if (parse(token).variants.includes('motion-safe')) {
		return true;
	}

	switch (kind) {
		case 'keyframe':
			return animationStoppedOn.some((selector) => element.matches(selector));
		case 'transition':
			return transitionsCollapse;
		case 'pointer':
			return false;
	}
}

const surfaces: [string, Component<Record<string, never>>][] = [
	['a sheet', SheetHarness as Component<Record<string, never>>],
	['a dialog', DialogHarness as Component<Record<string, never>>],
	['the record card', RecordCardHarness as Component<Record<string, never>>]
];

test('the reduced-motion block stops keyframes on what bits-ui marks, and collapses transitions', () => {
	expect(animationStoppedOn).toEqual(expect.arrayContaining(['[data-state]', '[data-motion]']));
	expect(transitionsCollapse).toBe(true);
});

test.each(surfaces)('with reduced motion on, %s neither moves nor fades', (_, surface) => {
	render(
		surface,
		{},
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings(), direction: 'ltr' } }
	);

	const motion = motionIn(document.body);

	// each of the three does move when motion is allowed, so an empty list here would be a test
	// that stopped looking rather than a surface that stopped moving.
	expect(motion.length).toBeGreaterThan(0);

	expect(
		motion
			.filter((each) => !stopped(each))
			.map(({ element, token }) => ({
				slot: element.getAttribute('data-slot'),
				token
			}))
	).toEqual([]);
});
