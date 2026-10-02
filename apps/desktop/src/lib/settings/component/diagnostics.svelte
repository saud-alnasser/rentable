<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	/**
	 * Where this installation writes down what went wrong, as a group of the general section: the
	 * folder, its path as the row's value, and the act that opens it.
	 *
	 * **The act is a labelled button with the glyph the two startup-failure screens put this same
	 * action behind** (`startup/component/error.svelte` and `unreadable.svelte`, `FolderOpenIcon`
	 * with this same string). It was a glyph-only chip until effort 846, which draws every row
	 * control in the area as a labelled button with a glyph (requirement 5), so the words are on
	 * screen rather than only in a tooltip.
	 *
	 * What the record is for is said once, under the group, rather than inside the row.
	 */
	let {
		diagnosticsDir,
		onRevealDiagnostics
	}: {
		diagnosticsDir: string;
		onRevealDiagnostics: () => void;
	} = $props();
</script>

<div data-diagnostics>
	<SettingsGroup
		title={$LL.settings.diagnosticsTitle()}
		footer={$LL.settings.diagnosticsDescription()}
	>
		{#snippet rows()}
			<SettingsRow icon={FolderIcon} name={$LL.settings.diagnosticsFolder()}>
				<!-- the path is the machine's, not the reader's language: isolating it keeps an ltr
				     path from reordering the arabic around it -->
				{#snippet value()}
					<span class="block text-xs break-all" dir="ltr">{diagnosticsDir}</span>
				{/snippet}

				{#snippet control()}
					<Button
						variant="outline"
						size="sm"
						disabled={!diagnosticsDir}
						onclick={onRevealDiagnostics}
					>
						<FolderOpenIcon class="size-4" />
						{$LL.settings.diagnosticsReveal()}
					</Button>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>
