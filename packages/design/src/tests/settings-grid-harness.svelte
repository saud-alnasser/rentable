<script lang="ts">
	/**
	 * A settings section's column of three cards, as a section draws one.
	 *
	 * Scaffolding rather than a test: the cards are snippets inside the grid, and a snippet holding a
	 * component is written in a component.
	 */
	import SettingsGrid from '#lib/block/settings-grid.svelte';
	import SettingsGroup from '#lib/block/settings-group.svelte';
	import SettingsRow from '#lib/block/settings-row.svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import PackageIcon from '@lucide/svelte/icons/package';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
</script>

<SettingsGrid>
	<SettingsGroup
		icon={SunMoonIcon}
		title="display"
		description="how it looks here."
		footer="each applies at once."
	>
		{#snippet rows()}
			<SettingsRow icon={LanguagesIcon} name="language" value="english" />
		{/snippet}
	</SettingsGroup>

	<SettingsGroup
		icon={PackageIcon}
		title="updates"
		description="the version this machine runs."
		footer="checked a minute ago."
	>
		{#snippet rows()}
			<SettingsRow icon={PackageIcon} name="current version" value="0.14.0" />
		{/snippet}
	</SettingsGroup>

	<SettingsGroup
		icon={FolderIcon}
		title="diagnostics"
		description="what went wrong, kept here."
		footer="nothing leaves this machine."
	>
		{#snippet rows()}
			<SettingsRow icon={FolderIcon} name="log folder" />
		{/snippet}
	</SettingsGroup>
</SettingsGrid>
