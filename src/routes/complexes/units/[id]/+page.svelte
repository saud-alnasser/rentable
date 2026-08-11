<script lang="ts">
	import { page } from '$app/state';
	import UnitDetails from '$lib/complex/component/unit-details.svelte';

	const unitId = Number(page.params.id);
</script>

<div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 p-5">
	<UnitDetails {unitId} />
</div>
