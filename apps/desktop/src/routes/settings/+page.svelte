<script lang="ts">
	import { sectionsOn } from '$lib/app/surfaces';
	import { useLeaveForTheWall, useSignedIn } from '$lib/app/wall';
	import SettingsPage from '$lib/settings/component/page.svelte';

	// the settings' address. The page and its queries are settings'; whether anybody is signed in,
	// the sections other features contribute and the way to the wall are handed to it from here.
	const signedIn = useSignedIn();
	const sections = sectionsOn('settings');
	const leaveForTheWall = useLeaveForTheWall();
</script>

<SettingsPage signedIn={signedIn.current} {sections} {leaveForTheWall} />
