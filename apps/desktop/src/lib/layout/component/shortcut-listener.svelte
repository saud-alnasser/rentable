<script lang="ts">
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';

	/**
	 * The application's one keyboard listener.
	 *
	 * Every shortcut used to bring its own, which is why nothing could enumerate them. This one
	 * knows none of them by name: it asks the registry which shortcuts the keydown answers, and
	 * runs those.
	 */
	function handleKeydown(event: KeyboardEvent) {
		const answering = shortcuts.answering(event, event.target);

		if (answering.length === 0) {
			return;
		}

		// what the key would otherwise have done is the browser's, and every shortcut here was
		// already taking it before this listener existed.
		event.preventDefault();

		for (const shortcut of answering) {
			shortcut.run();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />
