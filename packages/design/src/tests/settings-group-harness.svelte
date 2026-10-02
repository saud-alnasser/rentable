<script lang="ts">
	/**
	 * A settings group of two rows and one row that ends something, as a section draws one.
	 *
	 * Scaffolding rather than a test. A group's rows are snippets, and a snippet holding a component
	 * is written in a component, so the subject cannot be rendered from the test file alone. Each
	 * control writes the label id it was handed onto itself, so a test can see what reached it.
	 */
	import SettingsGroup from '#lib/block/settings-group.svelte';
	import SettingsRow from '#lib/block/settings-row.svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
</script>

<SettingsGroup title="this machine" footer="signing in again brings it back.">
	{#snippet rows()}
		<SettingsRow icon={LanguagesIcon} name="language" value="english">
			{#snippet control({ labelId })}
				<button type="button" aria-labelledby={labelId} data-handed={labelId}>change</button>
			{/snippet}
		</SettingsRow>
		<SettingsRow icon={KeyRoundIcon} name="password">
			{#snippet beneath()}
				<p data-beneath>set on another machine.</p>
			{/snippet}
		</SettingsRow>
	{/snippet}

	{#snippet end()}
		<SettingsRow icon={LogOutIcon} name="sign out of this machine" tone="error">
			{#snippet control({ labelId })}
				<button type="button" data-handed={labelId}>sign out</button>
			{/snippet}
		</SettingsRow>
	{/snippet}
</SettingsGroup>
