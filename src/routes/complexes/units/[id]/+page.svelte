<script lang="ts">
	import { page } from '$app/state';
	import ComplexDetails from '$lib/complex/component/details.svelte';

	const complexId = Number(page.params.id);
</script>

<div class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 p-5">
	<ComplexDetails {complexId} initialSection="units" />
</div>
