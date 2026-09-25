<script lang="ts">
	import { toCreateShortcut } from '$lib/design/create-key';
	import { createTargets } from '$lib/design/create-target.svelte';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';

	/**
	 * The create key, registered once for the whole window.
	 *
	 * Mounted in the frame beside the undo pair and on every screen, so Ctrl or Cmd with N is always
	 * the application's: where no set is on screen it is refused with its reason, and the webview
	 * never gets it to open a window with.
	 */

	/**
	 * whether a form, a sheet or a confirmation stands over the set. The command menu does not
	 * count: it is how the key is asked for by name, and it closes as the form opens.
	 */
	function isCovered() {
		return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
			(surface) => !surface.querySelector('[data-slot="command"]')
		);
	}

	// registered rather than listened for: the keydown reaches the application's one listener,
	// and the sheet and the command menu read what is registered here without being told about it.
	$effect(() => shortcuts.register(toCreateShortcut(() => createTargets.onScreen, isCovered)));
</script>
