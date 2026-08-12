<script lang="ts">
	import { page } from '$app/state';
	import TenantDetails from '$lib/tenant/component/details.svelte';

	const tenantId = Number(page.params.id);
</script>

<TenantDetails {tenantId} />
