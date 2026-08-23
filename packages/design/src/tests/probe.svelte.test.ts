import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import Probe from './probe.svelte';

test('a component renders the string it was given', () => {
	render(Probe, { label: 'a rent' });

	expect(screen.getByTestId('probe').textContent).toBe('a rent');
});

test('a prop change reaches the dom', async () => {
	const { rerender } = render(Probe, { label: 'a rent' });

	await rerender({ label: 'a rent', count: 2 });

	expect(screen.getByTestId('probe').textContent).toBe('a rent (2)');
});
