<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import TenantDetails from '$lib/tenant/component/details.svelte';

	const tenantId = page.params.id ?? '';
</script>

<TenantDetails {tenantId} sections={sectionsOn('tenant')} />
