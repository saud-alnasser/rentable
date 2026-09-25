<script lang="ts">
	import { page } from '$app/state';
	import UnitDetails from '$lib/complex/unit/component/details.svelte';

	const unitId = page.params.id ?? '';
</script>

<UnitDetails {unitId} />
