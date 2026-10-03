<script lang="ts">
	/**
	 * A settings card whose one act sits at its header's trailing edge, after its value, as the
	 * account's password and machines cards draw theirs.
	 *
	 * Scaffolding rather than a test: the act is a snippet, and a snippet is written in a component.
	 */
	import SettingsGroup from '#lib/block/settings-group.svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	let { value }: { value?: string } = $props();
</script>

{#snippet change()}
	<button type="button" data-header-act>change</button>
{/snippet}

<SettingsGroup
	icon={KeyRoundIcon}
	title="password"
	description="the password you sign in with."
	{value}
	action={change}
/>
