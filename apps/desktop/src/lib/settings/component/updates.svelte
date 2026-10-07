<script lang="ts">
	import { UpdateAction } from '$lib/update/ui';

	/**
	 * What this installation is running, and how it gets the next one: the general section's
	 * updates card.
	 *
	 * **It is the update action's `card` variant** (effort 857, ticket 10), the one control that
	 * also stands on the update screen and in the read-only notice, so the card and those places
	 * show the same download and can never disagree about it. What the card looks like and why is
	 * written there (`update/component/update-action.svelte`); where the update stands is the
	 * updater's, so leaving the tab mid-download neither cancels nor forgets it (effort 854,
	 * requirement 13).
	 */
	let { version }: { version: string } = $props();
</script>

<UpdateAction variant="card" {version} />
