<script lang="ts">
	import { Kbd, KbdGroup } from '@rentable/design/primitive/kbd/index.js';
	import * as Sheet from '$lib/design/primitive/sheet';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import { toShortcutSheetEntries } from '$lib/design/shortcut-registry';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		open = $bindable(false)
	}: {
		/** Whether the sheet is showing. Bind to it to open the sheet from a trigger. */
		open?: boolean;
	} = $props();

	// which keyboard this is does not change while the window is open, so it is read once
	// rather than once per shortcut.
	const isAppleKeyboard = usesAppleKeyboard();

	// every line here is derived from what is registered. Nothing about a shortcut is written
	// on this surface, which is what makes a shortcut registered anywhere appear on it with no
	// edit to this file.
	const entries = $derived(toShortcutSheetEntries(shortcuts.registered, $LL, isAppleKeyboard));
</script>

<Sheet.Root bind:open>
	<Sheet.Content>
		<!-- the header's own inset is the primitive's; overridden at this one composition so the
		     rows below line up with the title, and so neither line runs under the close control
		     the content primitive floats over this corner. -->
		<Sheet.Header class="px-4 pe-12">
			<Sheet.Title class="capitalize">{$LL.common.ui.keyboardShortcuts()}</Sheet.Title>
			<Sheet.Description>{$LL.common.ui.keyboardShortcutsDescription()}</Sheet.Description>
		</Sheet.Header>

		<!-- no rule between rows: the gap already separates them, and a divider per line is the
		     clutter *Use fewer borders* (238) describes. -->
		<ul class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
			{#each entries as entry (entry.id)}
				<li class="flex items-center justify-between gap-4 py-1.5">
					<span class="min-w-0 flex-1 truncate text-sm capitalize">{entry.description}</span>

					<!-- a key name is not prose: it is what is printed on the keyboard, and the
					     keyboard does not change with the locale. -->
					<KbdGroup dir="ltr" class="shrink-0">
						{#each entry.hints as hint (hint)}
							<Kbd>{hint}</Kbd>
						{/each}
					</KbdGroup>
				</li>
			{/each}
		</ul>
	</Sheet.Content>
</Sheet.Root>
