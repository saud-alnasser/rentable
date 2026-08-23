import { DesignProvider } from '#lib/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import Contract from '../../tests/contract.svelte';
import ContractHarness from '../../tests/contract-harness.svelte';

/**
 * The two failures this move creates, and neither of them is caught by anything else here.
 *
 * A component that loses its direction still renders, and a component that loses its string
 * still renders. That is what makes them worth a test rather than a reading: what they produce
 * is a screen that is subtly wrong in Arabic and correct in English, which is exactly the half
 * of the application a reviewer is least likely to open.
 *
 * **Delete `direction` from the first, or `loading` from the second, and that test fails.**
 */
test('a component renders in the direction the contract supplied', () => {
	render(
		Contract,
		{},
		{ wrapper: DesignProvider, wrapperProps: { strings: { loading: 'loading' }, direction: 'rtl' } }
	);

	expect(screen.getByTestId('contract').getAttribute('dir')).toBe('rtl');
});

test('a component renders the string the contract supplied', () => {
	render(
		Contract,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: { loading: 'جارٍ التحميل' }, direction: 'rtl' }
		}
	);

	expect(screen.getByTestId('contract').textContent).toBe('جارٍ التحميل');
});

/**
 * The reason the provider writes getters into context rather than the object it was handed.
 *
 * `setContext` runs once, during the provider's own initialisation, so a plain object written
 * there is the words the consumer started with and nothing else. This application switches
 * language while it is running. Replace the getters with `setContext(DESIGN_CONTRACT, { strings,
 * direction })` and this is the only test that fails.
 *
 * It takes the fixture rather than `wrapper` because what has to change is the provider's own
 * props, and `rerender` drives the subject's.
 */
test('a language switch reaches a component that has already rendered', async () => {
	const { rerender } = render(ContractHarness, {
		strings: { loading: 'loading' },
		direction: 'ltr'
	});

	await rerender({ strings: { loading: 'جارٍ التحميل' }, direction: 'rtl' });

	expect(screen.getByTestId('contract').getAttribute('dir')).toBe('rtl');
	expect(screen.getByTestId('contract').textContent).toBe('جارٍ التحميل');
});

/**
 * The backstop under the type, which cannot see this case: a consumer's object is only checked
 * where it renders the provider, so an application that renders none type-checks and would
 * otherwise draw every packaged component wordless.
 */
test('a component rendered outside the provider throws rather than falling back', () => {
	expect(() => render(Contract)).toThrow(/outside DesignProvider/);
});
