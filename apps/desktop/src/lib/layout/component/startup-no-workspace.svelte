<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * A member who is in, with nowhere to go.
	 *
	 * An organization whose owner has not created a workspace yet admits its members to nothing
	 * behind the wall, and this is what it draws: the organization's name, a sentence saying so,
	 * and nothing to press. Creating a workspace is the workspace ticket's, and the action lands
	 * here when it does; a screen that offered it before it existed would be a promise.
	 *
	 * On the application surface rather than a route, because it presents the application's own
	 * state, and over every address, because there is no workspace for any address to draw from.
	 */
	let { organizationName }: { organizationName: string } = $props();
</script>

<StandaloneSurface
	tone="neutral"
	title={$LL.layout.noWorkspace.title()}
	description={$LL.layout.noWorkspace.description()}
>
	<p class="text-sm font-medium" data-no-workspace-organization>{organizationName}</p>
</StandaloneSurface>
