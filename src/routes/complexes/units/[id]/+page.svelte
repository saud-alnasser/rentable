<script lang="ts">
	import { page } from '$app/state';
	import UnitsDataView from '$lib/resources/complexes/components/units-data-view.svelte';

	const complexId = Number(page.params.id);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 p-5">
	<UnitsDataView {complexId} />
</div>
