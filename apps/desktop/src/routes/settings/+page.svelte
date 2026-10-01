<script lang="ts">
	import { resolve } from '$app/paths';
	import { sectionsOn } from '$lib/app/surfaces';
	import { useSignedIn } from '$lib/organization/ui';
	import SettingsPage from '$lib/settings/component/page.svelte';
	import { THE_WAY_IN, useLeaveForTheWall } from '$lib/startup/ui';

	// the settings' address. The page and its queries are settings'; whether anybody is signed in,
	// the sections other features contribute, the way to the wall and the way in's address are
	// handed to it from here.
	const signedIn = useSignedIn();
	const sections = sectionsOn('settings');
	const leaveForTheWall = useLeaveForTheWall();
</script>

<SettingsPage
	signedIn={signedIn.current}
	{sections}
	{leaveForTheWall}
	wayIn={resolve(THE_WAY_IN)}
/>
