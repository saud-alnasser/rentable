<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import TenantsDirectory from '$lib/tenant/component/directory.svelte';
</script>

<!-- fills: the directory's own list scrolls, so the frame has to be exactly as tall as the
     window for it to have a height to scroll inside. -->
<PageFrame fills>
	<TenantsDirectory />
</PageFrame>
