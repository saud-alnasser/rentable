<script lang="ts">
	import { page } from '$app/state';
	import UnitDetails from '$lib/complex/component/unit-details.svelte';

	const unitId = Number(page.params.id);
</script>

<UnitDetails {unitId} />
