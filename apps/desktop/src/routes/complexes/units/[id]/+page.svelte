<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import UnitDetails from '$lib/complex/unit/component/details.svelte';

	const unitId = page.params.id ?? '';
</script>

<UnitDetails {unitId} sections={sectionsOn('unit')} />
