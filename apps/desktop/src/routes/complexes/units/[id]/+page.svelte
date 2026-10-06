<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import UnitDetails from '$lib/complex/unit/component/details.svelte';

	const unitId = $derived(page.params.id ?? '');
</script>

<!-- keyed on the record, so moving from one record to another of this kind (a renewal, the
     palette, a link, the back button) shows the second from its own start rather than keeping the
     first on screen. -->
{#key unitId}
	<UnitDetails {unitId} sections={sectionsOn('unit')} />
{/key}
