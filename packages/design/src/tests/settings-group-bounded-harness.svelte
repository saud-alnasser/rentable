<script lang="ts">
	/**
	 * A settings card of a long list: a bar over its rows, and the rows bounded to a few in view.
	 *
	 * Scaffolding rather than a test, for the same reason as `settings-group-harness.svelte`: the
	 * rows and the bar are snippets, written in a component.
	 */
	import SettingsGroup from '#lib/block/settings-group.svelte';
	import SettingsRow from '#lib/block/settings-row.svelte';
	import LinkIcon from '@lucide/svelte/icons/link';

	let { count = 6 }: { count?: number } = $props();
</script>

<SettingsGroup
	icon={LinkIcon}
	title="pending links"
	description="links nobody opened."
	rowsInView={4}
>
	{#snippet bar()}
		<input aria-label="search" data-bar-input />
	{/snippet}
	{#snippet rows()}
		{#each Array.from({ length: count }, (_, index) => index) as index (index)}
			<SettingsRow icon={LinkIcon} name="link {index}">
				{#snippet control()}
					<button type="button">act {index}</button>
				{/snippet}
			</SettingsRow>
		{/each}
	{/snippet}
</SettingsGroup>
