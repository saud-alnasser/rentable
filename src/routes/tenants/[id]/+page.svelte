<script lang="ts">
	import { page } from '$app/state';
	import TenantDetails from '$lib/resources/tenants/components/tenant-details.svelte';

	const tenantId = Number(page.params.id);
</script>

<div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 p-5">
	<TenantDetails {tenantId} />
</div>
