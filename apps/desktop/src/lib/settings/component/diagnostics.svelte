<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	/**
	 * Where this installation writes down what went wrong, as a card of the general section: the
	 * folder, its path as the row's meta line, and the act that opens it.
	 *
	 * **Across both columns** (effort 846, *Everything in a tab is a card*), since a path is long
	 * and a half card would cut it to a few letters.
	 *
	 * **The path is one line under the folder's name, and the whole of it folds under the row**
	 * (*Detail that few readers need folds under its row*): the line says where the folder is at a
	 * glance and stops at the card's edge, and the few who need to read or copy the whole path open
	 * it, while *open log folder* stays in view.
	 *
	 * **The act is a labelled button with the glyph the two startup-failure screens put this same
	 * action behind** (`startup/component/error.svelte` and `unreadable.svelte`, `FolderOpenIcon`
	 * with this same string). It was a glyph-only chip until effort 846, which draws every row
	 * control in the area as a labelled button with a glyph (requirement 5), so the words are on
	 * screen rather than only in a tooltip.
	 *
	 * What the record is for is said once, in the card's header, rather than inside the row.
	 */
	let {
		diagnosticsDir,
		onRevealDiagnostics
	}: {
		diagnosticsDir: string;
		onRevealDiagnostics: () => void;
	} = $props();
</script>

<!-- the path is the machine's, not the reader's language: isolated so an ltr path keeps its own
     order, while the line it stands on keeps the reader's direction and starts under the name. -->
{#snippet path()}
	<span class="block truncate" data-diagnostics-path><bdi dir="ltr">{diagnosticsDir}</bdi></span>
{/snippet}

{#snippet wholePath()}
	<span class="block text-xs break-all select-text" data-diagnostics-whole-path>
		<bdi dir="ltr">{diagnosticsDir}</bdi>
	</span>
{/snippet}

<div data-diagnostics class="contents">
	<SettingsGroup
		icon={ActivityIcon}
		title={$LL.settings.diagnosticsTitle()}
		description={$LL.settings.diagnosticsDescription()}
		span="full"
	>
		{#snippet rows()}
			<SettingsRow
				icon={FolderIcon}
				name={$LL.settings.diagnosticsFolder()}
				meta={diagnosticsDir ? path : undefined}
				details={diagnosticsDir ? wholePath : undefined}
				detailsLabel={$LL.settings.diagnosticsFullPath()}
				detailsKey="settings.diagnostics.path"
			>
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
