<script lang="ts">
	import type { Inverse } from '$lib/design/inverse';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { invalidateWorkspaceData } from '$lib/design/query';
	import { toUndoIntent } from '$lib/design/undo-shortcut';
	import { undo } from '$lib/design/undo.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import RedoIcon from '@lucide/svelte/icons/redo-2';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import { useQueryClient } from '@tanstack/svelte-query';

	const client = useQueryClient();

	const undoLabel = $derived(
		undo.undoable
			? $LL.common.undo.undo({ change: undo.undoable.describe($LL) })
			: $LL.common.undo.nothingToUndo()
	);
	const redoLabel = $derived(
		undo.redoable
			? $LL.common.undo.redo({ change: undo.redoable.describe($LL) })
			: $LL.common.undo.nothingToRedo()
	);

	// the inverse issues an ordinary procedure, so the workspace has moved by the time it
	// resolves and the cache is as stale as it would be after any other mutation.
	async function apply(issue: () => Promise<Inverse | null>, announce: (change: string) => string) {
		try {
			const applied = await issue();

			if (!applied) {
				return;
			}

			await invalidateWorkspaceData(client);

			onMutationSuccess({ toast: { success: () => announce(applied.describe($LL)) } });
		} catch (failure) {
			onMutationError(
				{ toast: { error: true, unexpected: () => $LL.common.messages.unexpectedError() } },
				failure as Error
			);
		}
	}

	const applyUndo = () => apply(undo.undo, (change) => $LL.common.undo.undone({ change }));
	const applyRedo = () => apply(undo.redo, (change) => $LL.common.undo.redone({ change }));

	function handleShortcut(event: KeyboardEvent) {
		const intent = toUndoIntent(event, event.target);

		if (!intent) {
			return;
		}

		event.preventDefault();
		void (intent === 'undo' ? applyUndo() : applyRedo());
	}
</script>

<svelte:window onkeydown={handleShortcut} />

<div class="flex shrink-0 items-center gap-0.5">
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={undoLabel}
					disabled={!undo.undoable || undo.isApplying}
					onclick={applyUndo}
				>
					<UndoIcon class="size-4 rtl:-scale-x-100" />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom" sideOffset={8}>{undoLabel}</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={redoLabel}
					disabled={!undo.redoable || undo.isApplying}
					onclick={applyRedo}
				>
					<RedoIcon class="size-4 rtl:-scale-x-100" />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom" sideOffset={8}>{redoLabel}</Tooltip.Content>
	</Tooltip.Root>
</div>
