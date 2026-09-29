<script lang="ts">
	import { host } from '$lib/app/host';
	import { THE_WAY_IN, useStartup } from '$lib/app/wall';
	import OrganizationSetupJoin from '$lib/organization/setup/component/join.svelte';

	// the join screen's address. The screen and what follows each link are the organization's; the
	// startup unit, the host's commands and the way in are handed to it from here.
	const startup = useStartup();
</script>

<OrganizationSetupJoin {startup} host={host.organization} wayIn={THE_WAY_IN} />
