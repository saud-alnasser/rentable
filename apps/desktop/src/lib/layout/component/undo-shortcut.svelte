<script lang="ts">
	import { undoable } from '$lib/design/inverse.svelte';
	import { applyRedo, applyUndo } from '$lib/design/mutation';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import { toUndoShortcuts } from '$lib/design/undo-shortcut';
	import { useQueryClient } from '@tanstack/svelte-query';

	const client = useQueryClient();

	// registered rather than listened for: the keydown reaches the application's one listener,
	// and the sheet reads what is registered here without being told about it.
	$effect(() =>
		shortcuts.register(
			...toUndoShortcuts(
				(intent) => {
					void (intent === 'undo' ? applyUndo(client) : applyRedo(client));
				},
				// read through the mirror rather than the stack, so a surface offering these by name
				// re-reads when a change lands rather than answering once, when it was mounted.
				(intent) => (intent === 'undo' ? undoable.canUndo : undoable.canRedo)
			)
		)
	);
</script>
