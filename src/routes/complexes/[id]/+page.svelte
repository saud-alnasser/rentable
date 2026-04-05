<script lang="ts">
	import { page } from '$app/state';
	import ComplexDetails from '$lib/resources/complexes/components/complex-details.svelte';

	type ComplexDetailsSection = 'overview' | 'units';

	const complexId = Number(page.params.id);
	let initialSection: ComplexDetailsSection = $derived(
		page.url.searchParams.get('section') === 'units' ? 'units' : 'overview'
	);
</script>

<div class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 p-5">
	<ComplexDetails {complexId} {initialSection} />
</div>
