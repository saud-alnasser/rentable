<script lang="ts">
	import { page } from '$app/state';
	import UnitsDataView from '$lib/resources/complexes/components/units-data-view.svelte';

	const complexId = Number(page.params.id);
</script>

<div class="flex flex-col gap-3 p-5">
	<UnitsDataView {complexId} />
</div>
