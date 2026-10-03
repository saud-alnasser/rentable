<script lang="ts">
	import { page } from '$app/state';
	import WorkspacePage from '$lib/organization/workspace/component/page.svelte';

	const workspaceId = $derived(page.params.id ?? '');
</script>

<!-- keyed on the workspace, so moving from one workspace's page to another's starts the second
     on what it holds rather than on a switch the first was turning. -->
{#key workspaceId}
	<WorkspacePage {workspaceId} />
{/key}
