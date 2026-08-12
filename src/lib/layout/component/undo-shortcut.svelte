<script lang="ts">
	import { applyRedo, applyUndo } from '$lib/design/mutation';
	import { toUndoIntent } from '$lib/design/undo-shortcut';
	import { useQueryClient } from '@tanstack/svelte-query';

	const client = useQueryClient();

	function handleShortcut(event: KeyboardEvent) {
		const intent = toUndoIntent(event, event.target);

		if (!intent) {
			return;
		}

		event.preventDefault();

		void (intent === 'undo' ? applyUndo(client) : applyRedo(client));
	}
</script>

<svelte:window onkeydown={handleShortcut} />
