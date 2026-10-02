<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	/**
	 * Where this installation writes down what went wrong, as a card of the general section: the
	 * folder, its whole path as the row's meta line, and the act that opens it.
	 *
	 * **The whole path is the line under the folder's name, and nothing folds** (effort 846,
	 * requirement 1 as revised on 2026-10-02, at the human's word: "whey there's a collapsoable on
	 * the diangostics"). A path is one line of facts a reader copies or reads out to somebody
	 * helping them, and in a card the column's whole width it has room to stand whole, wrapping
	 * where it must. *It was cut to one line with the whole of it folded under a chevron until
	 * ticket 31 of effort 846.*
	 *
	 * **The act is an icon control named by a tooltip** (the human's word: "the open log oflder
	 * should be just hte icon"), as [[contexts/desktop/components]] gives a short hint: an icon
	 * control's words. The glyph is the one the two startup-failure screens put this same action
	 * behind (`startup/component/error.svelte` and `unreadable.svelte`, `FolderOpenIcon` with this
	 * same string), and the string is the control's accessible name as well as its tooltip, so a
	 * screen reader and a pointer meet the same words.
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
	<span class="block break-all select-text" data-diagnostics-path>
		<bdi dir="ltr">{diagnosticsDir}</bdi>
	</span>
{/snippet}

<div data-diagnostics class="contents">
	<SettingsGroup
		icon={ActivityIcon}
		title={$LL.settings.diagnosticsTitle()}
		description={$LL.settings.diagnosticsDescription()}
	>
		{#snippet rows()}
			<SettingsRow
				icon={FolderIcon}
				name={$LL.settings.diagnosticsFolder()}
				meta={diagnosticsDir ? path : undefined}
			>
				{#snippet control()}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.settings.diagnosticsReveal()}
									disabled={!diagnosticsDir}
									data-diagnostics-reveal
									onclick={onRevealDiagnostics}
								>
									<FolderOpenIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8} data-diagnostics-reveal-hint>
							{$LL.settings.diagnosticsReveal()}
						</Tooltip.Content>
					</Tooltip.Root>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>
