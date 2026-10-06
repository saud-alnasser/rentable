<script lang="ts">
	/**
	 * The workspaces section with the rename form beside it, under the shared providers.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the subject is a
	 * tree: the card that names the workspace and the form that renames it share no parent in the
	 * shell (the form is the organization host's), and what is read is that a rename through the one
	 * reaches the other through the query client they both sit under. Nothing between them is stood
	 * in for; what reaches the shell is the test's to stand in for.
	 */
	import SettingsWorkspaces from '$lib/organization/component/settings-workspaces.svelte';
	import RenameForm from '$lib/organization/workspace/component/rename-form.svelte';
	import type { DesignDirection, DesignStrings } from '@rentable/design/strings.js';
	import Providers from '#tests/providers.svelte';

	let {
		strings,
		direction,
		workspace,
		onOpenChange
	}: {
		strings: DesignStrings;
		direction: DesignDirection;
		workspace: { name: string };
		onOpenChange: (value: boolean) => void;
	} = $props();

	let open = $state(true);
</script>

<Providers {strings} {direction}>
	<SettingsWorkspaces leaveForTheWall={async () => {}} />
	<RenameForm
		{workspace}
		{open}
		onOpenChange={(value) => {
			open = value;
			onOpenChange(value);
		}}
	/>
</Providers>
