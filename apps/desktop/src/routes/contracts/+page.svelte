<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import ContractsDirectory from '$lib/contract/component/directory.svelte';
</script>

<!-- fills: the directory's own list scrolls, so the frame has to be exactly as tall as the
     window for it to have a height to scroll inside. -->
<PageFrame fills>
	<ContractsDirectory />
</PageFrame>
