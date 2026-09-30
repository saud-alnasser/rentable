<script lang="ts">
	import { resolve } from '$app/paths';
	import { sectionsOn } from '$lib/app/surfaces';
	import { useSignedIn } from '$lib/organization/ui';
	import SettingsPage from '$lib/settings/component/page.svelte';
	import { THE_WAY_IN, useLeaveForTheWall } from '$lib/startup/ui';
	import BackControl from '@rentable/design/block/back-control.svelte';

	// the settings' address. The page and its queries are settings'; whether anybody is signed in,
	// the sections other features contribute and the way to the wall are handed to it from here.
	const signedIn = useSignedIn();
	const sections = sectionsOn('settings');
	const leaveForTheWall = useLeaveForTheWall();
</script>

<!-- signed out, the settings draw on the way-in frame, which has no rail to leave them by, so back
     sits in the frame's corner as it does on each step of the way in, and returns there
     (effort 843, requirement 7). -->
{#if !signedIn.current}
	<div class="absolute start-4 top-4 z-10">
		<BackControl fallback={resolve(THE_WAY_IN)} />
	</div>
{/if}

<SettingsPage signedIn={signedIn.current} {sections} {leaveForTheWall} />
