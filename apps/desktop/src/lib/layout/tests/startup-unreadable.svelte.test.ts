import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
import SurfaceAction from '@rentable/design/block/surface-action.svelte';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import StartupUnreadable from '$lib/layout/component/startup-unreadable.svelte';
import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

/**
 * THE SCREEN WITH NO ERROR BOUNDARY ABOVE IT
 *
 * `routes/+layout.svelte` draws this one outside `DesignProvider` and `TooltipProvider`, because
 * both are rendered inside the locale gate and this is the screen for a startup that failed before
 * it reached a dictionary. Nothing catches a throw here and there is no way out but quitting, so
 * an empty window is what a mistake in it looks like.
 *
 * Two prop values are the whole of what keeps it drawn, and until this file they were held by
 * comments. `svelte-check` cannot see either, because a missing context is a runtime throw.
 */

const message = 'settings.json is not valid json';

test('the startup screen renders with neither provider above it', () => {
	render(StartupUnreadable, { message, onRetry: () => {} });

	expect(screen.getByRole('heading', { name: 'rentable' })).toBeDefined();
	expect(screen.getByText(message)).toBeDefined();
	expect(screen.getByRole('button', { name: 'open log folder' })).toBeDefined();
	expect(screen.getByRole('button', { name: 'retry startup' })).toBeDefined();
});

/**
 * The two below render the packaged blocks directly rather than mutating the screen, because what
 * is under test is the guard rather than the screen: each one drops exactly the prop value the
 * screen sets and asserts on the throw it was preventing. A mutation of `startup-unreadable.svelte`
 * would prove the same thing and could not live in the suite.
 */

test('a surface action with its tooltip left on throws, naming the provider', () => {
	// bits-ui's own message, and it arrives before the string contract's: `Tooltip.Root` reads its
	// provider while rendering, and `Tooltip.Content` reads `DesignProvider`'s only once the
	// tooltip opens. Either would do here; the first one is what the screen actually meets.
	expect(() =>
		render(SurfaceAction, {
			label: 'open log folder',
			icon: FolderOpenIcon,
			onclick: () => {}
		})
	).toThrowError(/Tooltip\.Provider/);
});

test('a standalone surface that is busy and untoned throws, naming the provider', () => {
	expect(() =>
		render(StandaloneSurface, {
			title: 'rentable',
			description: message,
			busy: true
		})
	).toThrowError(/DesignProvider/);
});
