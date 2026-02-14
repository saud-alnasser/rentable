<script lang="ts">
	import { page } from '$app/state';
	import UnitsTable from '$lib/resources/units/components/units-table.svelte';

	const complexId = Number(page.params.id);
</script>

<div class="flex flex-col gap-3 p-5">
	<UnitsTable {complexId} />
</div>
