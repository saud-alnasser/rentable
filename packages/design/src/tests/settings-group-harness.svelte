<script lang="ts">
	/**
	 * A settings card of three rows and one row that ends something, as a section draws one.
	 *
	 * Scaffolding rather than a test. A group's rows are snippets, and a snippet holding a component
	 * is written in a component, so the subject cannot be rendered from the test file alone. Each
	 * control writes the label id it was handed onto itself, so a test can see what reached it.
	 *
	 * The third row folds its detail under it; the row that ends something is handed detail too,
	 * which it must not fold.
	 */
	import SettingsGroup from '#lib/block/settings-group.svelte';
	import SettingsRow from '#lib/block/settings-row.svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
</script>

{#snippet path()}
	<span data-full-path>C:\Users\somebody\AppData\Roaming\rentable\logs</span>
{/snippet}

<SettingsGroup
	icon={MonitorIcon}
	title="this machine"
	description="what this machine holds."
	value="2 rows"
	footer="signing in again brings it back."
>
	{#snippet rows()}
		<SettingsRow icon={LanguagesIcon} name="language" value="english">
			{#snippet control({ labelId })}
				<button type="button" aria-labelledby={labelId} data-handed={labelId}>change</button>
			{/snippet}
		</SettingsRow>
		<SettingsRow icon={KeyRoundIcon} name="password" meta="changed last week" badge="set">
			{#snippet beneath()}
				<p data-beneath>set on another machine.</p>
			{/snippet}
		</SettingsRow>
		<SettingsRow
			icon={FolderIcon}
			name="log folder"
			meta="C:\Users\somebody\..."
			value="kept here"
			details={path}
			detailsLabel="the whole path"
			detailsKey="harness.log-folder"
		>
			{#snippet control()}
				<button type="button" data-reveal>reveal</button>
			{/snippet}
		</SettingsRow>
	{/snippet}

	{#snippet end()}
		<SettingsRow icon={LogOutIcon} name="sign out of this machine" tone="error" details={path}>
			{#snippet control({ labelId })}
				<!-- the caller's destructive ghost button, as a section draws one: the row's one red. -->
				<button type="button" class="text-destructive" data-handed={labelId} data-ending-act>
					sign out
				</button>
			{/snippet}
		</SettingsRow>
	{/snippet}
</SettingsGroup>
