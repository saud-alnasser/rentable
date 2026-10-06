// Shared scaffolding for the tests of every surface that draws a password field. Not a `*.test.ts`
// file, so the runner does not pick it up directly.
//
// Effort 851, requirement 19: every password field carries an eye at its trailing end, and the
// tests of eight surfaces in four modules each check theirs. How the eye holds and lets go is the
// block's, and is tested in the design package; what a surface owes is that its field is drawn
// with it, under the reader's word for it. A test reaches this as `#tests/password-eye.ts`.

import { fireEvent } from '@testing-library/svelte';
import { expect } from 'vitest';

/**
 * Asserts that `field` is a password field with its eye, named `name`: dots at rest, the
 * characters while the eye is held, and dots again once the press is let go on the window.
 */
export async function expectTheEye(field: HTMLInputElement | null | undefined, name: string) {
	expect(field?.type).toBe('password');

	const eye = field
		?.closest('[data-password-input]')
		?.querySelector<HTMLButtonElement>('[data-password-eye]');

	expect(eye?.getAttribute('aria-label')).toBe(name);
	expect(eye?.closest('[data-align]')?.getAttribute('data-align')).toBe('inline-end');

	await fireEvent.pointerDown(eye!, { button: 0 });
	expect(field?.type).toBe('text');

	await fireEvent.pointerUp(window);
	expect(field?.type).toBe('password');
}
