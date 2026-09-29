import { getContext, setContext } from 'svelte';

import type { Palette, PaletteDestination } from './palette';

/**
 * THE COMMAND MENU, OPENED FROM THE FRAME AND MOUNTED AMONG THE HOSTS
 *
 * The menu is mounted once, by its host (`component/host.svelte`), where `app/surfaces.ts` puts it
 * among the other hosts: after the workspace's permissions and before the tenant's host, where the
 * frame drew it before effort 840. Its trigger is the frame's search button, which shares no parent
 * with it, so whether it is showing is this module-level rune state, the shape the record hosts
 * set: the button raises it here and the host binds the menu to it.
 */

export const paletteMenu = $state<{
	/** whether the menu is showing. The host binds the menu's `open` to it. */
	open: boolean;
}>({ open: false });

/** Open the command menu, as its trigger does. */
export function openPalette() {
	paletteMenu.open = true;
}

/**
 * What the menu is handed, which only the shell holds: the menu `app/` builds from the surfaces,
 * and the places the reader may go to, read again whenever what the reader may view changes.
 */
export type PaletteInputs = {
	palette: Palette;
	destinations: () => readonly PaletteDestination[];
};

/**
 * **Provided by the frame, as context, and read by the host it mounts.** A host is mounted with no
 * props, and what the menu is handed is the shell's: the places come from its navigation, which
 * this capability may not import.
 */
const INPUTS = Symbol('palette');

/** Hand the menu what it shows. Called by the frame, during its setup. */
export function providePalette(inputs: PaletteInputs) {
	// a frame mounting starts with the menu closed, as the frame's own state did before effort 840,
	// so an open menu does not outlive the frame it was opened in.
	paletteMenu.open = false;
	setContext(INPUTS, inputs);
}

/** What the frame handed the menu. */
export function usePalette(): PaletteInputs {
	const inputs = getContext<PaletteInputs | undefined>(INPUTS);

	if (!inputs) {
		throw new Error('the command menu was mounted outside the frame that provides it');
	}

	return inputs;
}
