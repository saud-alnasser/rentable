<script lang="ts">
	import { THE_WAY_IN, useStartup } from '$lib/app/wall';
	import OrganizationSetupFirstRun from '$lib/organization/setup/component/first-run.svelte';

	// the first run's address. The walk and its hand-over are the organization's; the startup unit
	// it hands over to and the way in it leaves for are handed to it from here.
	const startup = useStartup();
</script>

<OrganizationSetupFirstRun {startup} wayIn={THE_WAY_IN} />
