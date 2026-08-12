<script lang="ts">
	import { page } from '$app/state';
	import ComplexDetails from '$lib/complex/component/details.svelte';

	const complexId = Number(page.params.id);
</script>

<ComplexDetails {complexId} />
