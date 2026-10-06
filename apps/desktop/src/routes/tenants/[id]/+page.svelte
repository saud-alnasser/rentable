<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import TenantDetails from '$lib/tenant/component/details.svelte';

	const tenantId = $derived(page.params.id ?? '');
</script>

<!-- keyed on the record, so moving from one record to another of this kind (a renewal, the
     palette, a link, the back button) shows the second from its own start rather than keeping the
     first on screen. -->
{#key tenantId}
	<TenantDetails {tenantId} sections={sectionsOn('tenant')} />
{/key}
