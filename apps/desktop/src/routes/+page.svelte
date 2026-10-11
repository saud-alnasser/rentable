<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import DashboardLanding from '$lib/dashboard/component/landing.svelte';
</script>

<!-- at least the window's height, still growing with what it holds: a landing screen with nothing
     for the reader's role says so in the middle of the window, not at its top. -->
<PageFrame class="flex-1">
	<DashboardLanding />
</PageFrame>
